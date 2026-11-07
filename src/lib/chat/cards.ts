// Structured "cards" shown in the chat. They are built by code from tool
// results (never by the model) and sent with the reply stream. The browser
// draws them from its own menu and pricing code, so a card can only show
// real items and correct prices. Cards are also saved in localStorage with
// the conversation, so everything here is validated again when loaded.

import { z } from "zod";
import { findMenuItem } from "@/data/menu";
import { sanitizeCart, type CartLine } from "@/lib/cart";
import { normaliseOrderId } from "@/lib/orders";
import type { Fulfilment } from "@/lib/pricing";
import type { Plan } from "@/lib/planner";

export type PlanCard = {
  kind: "plan";
  people: number;
  fulfilment: Fulfilment;
  lines: CartLine[];
  budgetSen?: number;
  withinBudget: boolean;
  adjustments: string[];
  relaxed: string[];
  freeDeliveryHint?: string;
  deliveryMinimumNote?: string;
  /** Set in the browser once the plan has been added to the cart. */
  added?: boolean;
};

export type ChatCard =
  | PlanCard
  | { kind: "items"; itemIds: string[]; more: number }
  | { kind: "cart"; fulfilment: Fulfilment; lines: CartLine[] }
  | { kind: "order"; orderId: string };

export const MAX_ITEM_CARDS = 6;
const MAX_CARDS = 4;

export function planCard(plan: Plan, fulfilment: Fulfilment): PlanCard {
  return {
    kind: "plan",
    people: plan.people,
    fulfilment,
    lines: plan.lines,
    budgetSen: plan.budgetSen,
    withinBudget: plan.withinBudget,
    adjustments: plan.adjustments,
    relaxed: plan.relaxed,
    freeDeliveryHint: plan.freeDeliveryHint,
    deliveryMinimumNote: plan.deliveryMinimumNote,
  };
}

const note = z.string().max(300);
const fulfilmentSchema = z.enum(["delivery", "pickup"]);
const cardSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("plan"),
    people: z.number().int().min(1).max(20),
    fulfilment: fulfilmentSchema,
    lines: z.unknown(),
    budgetSen: z.number().int().positive().max(1_000_000).optional(),
    withinBudget: z.boolean(),
    adjustments: z.array(note).max(10),
    relaxed: z.array(note).max(10),
    freeDeliveryHint: note.optional(),
    deliveryMinimumNote: note.optional(),
    added: z.boolean().optional(),
  }),
  z.object({ kind: z.literal("items"), itemIds: z.array(z.string().max(64)).max(MAX_ITEM_CARDS), more: z.number().int().min(0).max(100) }),
  z.object({ kind: z.literal("cart"), fulfilment: fulfilmentSchema, lines: z.unknown() }),
  z.object({ kind: z.literal("order"), orderId: z.string().max(20) }),
]);

/** Validate one card from the stream or from storage. Returns undefined if it is not valid. */
export function sanitizeCard(raw: unknown): ChatCard | undefined {
  const parsed = cardSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const c = parsed.data;
  switch (c.kind) {
    case "plan":
      return { ...c, lines: sanitizeCart(c.lines) };
    case "items": {
      const itemIds = c.itemIds.filter((id) => findMenuItem(id));
      return itemIds.length ? { kind: "items", itemIds, more: c.more } : undefined;
    }
    case "cart":
      return { kind: "cart", fulfilment: c.fulfilment, lines: sanitizeCart(c.lines) };
    case "order": {
      const orderId = normaliseOrderId(c.orderId);
      return orderId ? { kind: "order", orderId } : undefined;
    }
  }
}

export function sanitizeCards(raw: unknown): ChatCard[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_CARDS)
    .map(sanitizeCard)
    .filter((c): c is ChatCard => !!c);
}
