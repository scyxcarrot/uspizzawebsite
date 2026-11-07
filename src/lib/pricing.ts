// Pricing rules. The UI and the chatbot both call these functions, so a
// price can only ever come from the menu data, never from the browser or
// the AI model.

import { CRUSTS, SIZES, findMenuItem, type CrustId, type MenuItem, type SizeId } from "@/data/menu";
import { STORE } from "@/data/store";
import type { CartLine } from "@/lib/cart";

export type Fulfilment = "delivery" | "pickup";

export type PricedLine = CartLine & {
  name: string;
  /** e.g. "Large · Cheese-Stuffed" for pizzas, "" for other items */
  optionsLabel: string;
  unitPriceSen: number;
  lineTotalSen: number;
  /** The item was marked sold out after it was added. Checkout is blocked until it is removed. */
  soldOut: boolean;
};

export type CartSummary = {
  lines: PricedLine[];
  itemCount: number;
  subtotalSen: number;
  deliveryFeeSen: number;
  totalSen: number;
  fulfilment: Fulfilment;
  /** Delivery needs a food subtotal of at least the minimum. Always true for pickup. */
  meetsMinimum: boolean;
  /** How much more food is needed to reach the delivery minimum (0 if met). */
  amountToMinimumSen: number;
  /** How much more food is needed for free delivery (0 if already free or pickup). */
  amountToFreeDeliverySen: number;
  /** Names of cart items that are now sold out. */
  soldOutNames: string[];
};

export function sizeName(size: SizeId): string {
  return SIZES.find((s) => s.id === size)?.name ?? size;
}

export function crustName(crust: CrustId): string {
  return CRUSTS.find((c) => c.id === crust)?.name ?? crust;
}

export function crustExtraSen(crust: CrustId): number {
  return CRUSTS.find((c) => c.id === crust)?.extraSen ?? 0;
}

/**
 * Price of one unit of an item with the given options.
 * Pizzas need a size and crust; other items ignore options.
 */
export function unitPriceSen(item: MenuItem, size?: SizeId, crust?: CrustId): number {
  if (item.kind === "simple") return item.price;
  if (!size || !crust) {
    throw new Error(`Pizza "${item.id}" needs a size and crust to be priced`);
  }
  return item.priceBySize[size] + crustExtraSen(crust);
}

/** Delivery fee for a given food subtotal. Pickup and empty carts are free. */
export function deliveryFeeSen(subtotalSen: number, fulfilment: Fulfilment): number {
  if (fulfilment === "pickup" || subtotalSen <= 0) return 0;
  return subtotalSen >= STORE.delivery.freeDeliveryThresholdSen ? 0 : STORE.delivery.feeSen;
}

export function meetsDeliveryMinimum(subtotalSen: number): boolean {
  return subtotalSen >= STORE.delivery.minimumOrderSen;
}

export function optionsLabel(size?: SizeId, crust?: CrustId): string {
  return [size && sizeName(size), crust && crustName(crust)].filter(Boolean).join(" · ");
}

/**
 * Recalculate every price in the cart from the menu data.
 * Lines that refer to unknown items are dropped (the cart should already be
 * sanitised, this is a safety net).
 */
export function priceCart(lines: CartLine[], fulfilment: Fulfilment = "delivery"): CartSummary {
  const priced: PricedLine[] = [];
  for (const line of lines) {
    const item = findMenuItem(line.itemId);
    if (!item) continue;
    const unit = unitPriceSen(item, line.size, line.crust);
    priced.push({
      ...line,
      name: item.name,
      optionsLabel: optionsLabel(line.size, line.crust),
      unitPriceSen: unit,
      lineTotalSen: unit * line.quantity,
      soldOut: !!item.soldOut,
    });
  }

  const subtotalSen = priced.reduce((sum, l) => sum + l.lineTotalSen, 0);
  const fee = deliveryFeeSen(subtotalSen, fulfilment);
  const isDelivery = fulfilment === "delivery";

  return {
    lines: priced,
    itemCount: priced.reduce((sum, l) => sum + l.quantity, 0),
    subtotalSen,
    deliveryFeeSen: fee,
    totalSen: subtotalSen + fee,
    fulfilment,
    meetsMinimum: !isDelivery || meetsDeliveryMinimum(subtotalSen),
    amountToMinimumSen: isDelivery
      ? Math.max(0, STORE.delivery.minimumOrderSen - subtotalSen)
      : 0,
    amountToFreeDeliverySen:
      isDelivery && subtotalSen > 0
        ? Math.max(0, STORE.delivery.freeDeliveryThresholdSen - subtotalSen)
        : 0,
    soldOutNames: [...new Set(priced.filter((l) => l.soldOut).map((l) => l.name))],
  };
}
