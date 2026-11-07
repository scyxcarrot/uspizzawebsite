// Order creation and status. Status is calculated by code from the time
// since the order was placed, never decided by the AI.

import { z } from "zod";
import { findOutlet } from "@/data/outlets";
import { sanitizeCart, type CartLine } from "@/lib/cart";
import { priceCart, type Fulfilment, type PricedLine } from "@/lib/pricing";

export const ORDER_STATUSES = [
  "received",
  "preparing",
  "baking",
  "out-for-delivery",
  "delivered",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Seconds since the order was placed at which each status starts (fast demo timings). */
export const STATUS_STARTS_AT_SECONDS: Record<OrderStatus, number> = {
  received: 0,
  preparing: 30,
  baking: 90,
  "out-for-delivery": 150,
  delivered: 240,
};

export type Customer = {
  name: string;
  phone: string;
  address?: string;
};

export type Order = {
  id: string;
  placedAt: string; // ISO timestamp
  fulfilment: Fulfilment;
  customer: Customer;
  lines: PricedLine[];
  subtotalSen: number;
  deliveryFeeSen: number;
  totalSen: number;
  /** The demo outlet that prepares the order. */
  outletId?: string;
  /** Seeded demo orders have a fixed status instead of a timed one. */
  fixedStatus?: OrderStatus;
};

export function statusFromElapsedMs(elapsedMs: number): OrderStatus {
  const seconds = Math.max(0, elapsedMs) / 1000;
  let current: OrderStatus = "received";
  for (const status of ORDER_STATUSES) {
    if (seconds >= STATUS_STARTS_AT_SECONDS[status]) current = status;
  }
  return current;
}

export function getOrderStatus(order: Pick<Order, "placedAt" | "fixedStatus">, now: Date): OrderStatus {
  if (order.fixedStatus) return order.fixedStatus;
  const placed = new Date(order.placedAt).getTime();
  if (Number.isNaN(placed)) return "received";
  return statusFromElapsedMs(now.getTime() - placed);
}

/** Customer-facing label. Pickup orders are collected rather than delivered. */
export function statusLabel(status: OrderStatus, fulfilment: Fulfilment): string {
  switch (status) {
    case "received":
      return "Order received";
    case "preparing":
      return "Preparing";
    case "baking":
      return "Baking";
    case "out-for-delivery":
      return fulfilment === "pickup" ? "Ready for pickup" : "Out for delivery";
    case "delivered":
      return fulfilment === "pickup" ? "Collected" : "Delivered";
  }
}

/** Cancellation is free until the order reaches Baking. */
export function canCancelFree(status: OrderStatus): boolean {
  return status === "received" || status === "preparing";
}

export const ORDER_ID_PATTERN = /^US-\d{4}$/;
export const FIRST_NEW_ORDER_NUMBER = 2001;

/**
 * Accept friendly variations like "us 1002", "#US-1002" or "1002" and return
 * "US-1002". Returns null when the input cannot be an order ID.
 */
export function normaliseOrderId(input: string): string | null {
  const match = input.trim().toUpperCase().match(/^#?(?:US)?[\s-]*(\d{4})$/);
  return match ? `US-${match[1]}` : null;
}

/** Next ID for a new browser order: US-2001, US-2002, ... */
export function nextOrderId(existingIds: string[]): string {
  let highest = FIRST_NEW_ORDER_NUMBER - 1;
  for (const id of existingIds) {
    if (!ORDER_ID_PATTERN.test(id)) continue;
    const n = Number(id.slice(3));
    if (n > highest) highest = n;
  }
  return `US-${String(highest + 1).padStart(4, "0")}`;
}

/** Build an order from a cart. Every price is recalculated from the menu. */
export function createOrder(args: {
  id: string;
  placedAt: Date;
  cart: CartLine[];
  fulfilment: Fulfilment;
  customer: Customer;
  outletId?: string;
  fixedStatus?: OrderStatus;
}): Order {
  const summary = priceCart(args.cart, args.fulfilment);
  const customer: Customer = { name: args.customer.name, phone: args.customer.phone };
  if (args.fulfilment === "delivery" && args.customer.address) {
    customer.address = args.customer.address;
  }
  const order: Order = {
    id: args.id,
    placedAt: args.placedAt.toISOString(),
    fulfilment: args.fulfilment,
    customer,
    lines: summary.lines,
    subtotalSen: summary.subtotalSen,
    deliveryFeeSen: summary.deliveryFeeSen,
    totalSen: summary.totalSen,
  };
  if (args.outletId && findOutlet(args.outletId)) order.outletId = args.outletId;
  if (args.fixedStatus) order.fixedStatus = args.fixedStatus;
  return order;
}

// Orders sent from the browser are untrusted. We keep only the fields we
// need and recalculate the totals from the menu, ignoring sent prices.
const browserOrderSchema = z.object({
  id: z.string().regex(ORDER_ID_PATTERN),
  placedAt: z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s))),
  fulfilment: z.enum(["delivery", "pickup"]),
  customer: z
    .object({
      name: z.string().max(80),
      phone: z.string().max(30),
      address: z.string().max(300).optional(),
    })
    .optional(),
  lines: z.array(z.unknown()).max(50),
  outletId: z.string().max(64).optional(),
});

export function sanitizeBrowserOrders(raw: unknown): Order[] {
  if (!Array.isArray(raw)) return [];
  const orders: Order[] = [];
  for (const entry of raw.slice(0, 50)) {
    const parsed = browserOrderSchema.safeParse(entry);
    if (!parsed.success) continue;
    // New browser orders may only use the US-2xxx range, so they cannot
    // impersonate the seeded demo orders.
    if (Number(parsed.data.id.slice(3)) < FIRST_NEW_ORDER_NUMBER) continue;
    orders.push(
      createOrder({
        id: parsed.data.id,
        placedAt: new Date(parsed.data.placedAt),
        cart: sanitizeCart(parsed.data.lines),
        fulfilment: parsed.data.fulfilment,
        customer: parsed.data.customer ?? { name: "", phone: "" },
        outletId: parsed.data.outletId,
      }),
    );
  }
  return orders;
}

export function findOrder(id: string, seeded: Order[], browserOrders: Order[]): Order | undefined {
  const normalised = normaliseOrderId(id);
  if (!normalised) return undefined;
  return (
    seeded.find((o) => o.id === normalised) ?? browserOrders.find((o) => o.id === normalised)
  );
}
