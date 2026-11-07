// Validation for the body of POST /api/chat. Everything from the browser
// is untrusted: messages are size-limited, and the cart and orders are
// rebuilt from the menu so client-side prices are ignored.

import { z } from "zod";
import { findMenuItem } from "@/data/menu";
import { sanitizeCart, type CartLine } from "@/lib/cart";
import { normaliseOrderId, sanitizeBrowserOrders, type Order } from "@/lib/orders";
import type { Fulfilment } from "@/lib/pricing";
import { LIMITS } from "@/lib/chat/config";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(LIMITS.maxStoredMessageChars),
});

export const chatRequestSchema = z.object({
  messages: z
    .array(messageSchema)
    .min(1)
    .max(LIMITS.maxMessages)
    .refine((m) => m[m.length - 1]?.role === "user", "The last message must be from the user.")
    .refine((m) => {
      const last = m[m.length - 1];
      return !!last && last.text.trim().length > 0 && last.text.length <= LIMITS.maxMessageChars;
    }, `Your message must be between 1 and ${LIMITS.maxMessageChars} characters.`),
  cart: z.unknown().optional(),
  orders: z.unknown().optional(),
  fulfilment: z.enum(["delivery", "pickup"]).optional(),
  /** The group order plan shown most recently and not yet added (rebuilt from the menu). */
  pendingPlan: z.unknown().optional(),
  /** The page the customer is on and the item they have open. Untrusted: checked below. */
  page: z.unknown().optional(),
});

/** Where the customer is. Only known pages and real menu items get through. */
export type PageContext = {
  page: "menu" | "checkout" | "track" | "order";
  orderId?: string;
  itemId?: string;
};

const pageSchema = z.object({ path: z.string().max(200), itemId: z.string().max(64).optional() });

export function parsePageContext(raw: unknown): PageContext | undefined {
  const parsed = pageSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const path = parsed.data.path.split(/[?#]/)[0]!.replace(/\/+$/, "") || "/";
  let context: PageContext | undefined;
  if (path === "/") context = { page: "menu" };
  else if (path === "/checkout") context = { page: "checkout" };
  else if (path === "/track") context = { page: "track" };
  else {
    const order = path.match(/^\/order\/([^/]+)$/);
    const orderId = order ? normaliseOrderId(decodeURIComponentSafe(order[1]!)) : null;
    if (orderId) context = { page: "order", orderId };
  }
  if (!context) return undefined;
  // An open item only makes sense on the menu page, and must be a real item.
  const item = context.page === "menu" && parsed.data.itemId ? findMenuItem(parsed.data.itemId) : undefined;
  return item ? { ...context, itemId: item.id } : context;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return "";
  }
}

export type ChatRequest = {
  messages: { role: "user" | "assistant"; text: string }[];
  cart: CartLine[];
  orders: Order[];
  fulfilment: Fulfilment;
  pendingPlan: CartLine[];
  page?: PageContext;
};

export type ParseResult = { ok: true; data: ChatRequest } | { ok: false; error: string };

export function parseChatRequest(body: unknown): ParseResult {
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const custom = issue?.code === "custom" ? issue.message : undefined;
    return { ok: false, error: custom ?? "The chat request was not valid." };
  }
  return {
    ok: true,
    data: {
      // Only recent messages are sent to the model, and empty ones are dropped.
      messages: parsed.data.messages.filter((m) => m.text.trim()).slice(-LIMITS.historySentToModel),
      cart: sanitizeCart(parsed.data.cart),
      orders: sanitizeBrowserOrders(parsed.data.orders),
      fulfilment: parsed.data.fulfilment ?? "delivery",
      pendingPlan: sanitizeCart(parsed.data.pendingPlan),
      page: parsePageContext(parsed.data.page),
    },
  };
}
