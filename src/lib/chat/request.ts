// Validation for the body of POST /api/chat. Everything from the browser
// is untrusted: messages are size-limited, and the cart and orders are
// rebuilt from the menu so client-side prices are ignored.

import { z } from "zod";
import { sanitizeCart, type CartLine } from "@/lib/cart";
import { sanitizeBrowserOrders, type Order } from "@/lib/orders";
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
});

export type ChatRequest = {
  messages: { role: "user" | "assistant"; text: string }[];
  cart: CartLine[];
  orders: Order[];
  fulfilment: Fulfilment;
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
    },
  };
}
