// Cart changes. Each function takes the current cart and returns a new one
// (it never mutates its input), so the UI and the chatbot tools can share
// exactly the same rules.

import { z } from "zod";
import {
  CRUSTS,
  DEFAULT_CRUST,
  SIZES,
  findMenuItem,
  type CrustId,
  type SizeId,
} from "@/data/menu";
import { crustName, sizeName } from "@/lib/pricing";

export type CartLine = {
  /** Stable ID built from the item and its options, e.g. "margherita:large:thin". */
  lineId: string;
  itemId: string;
  size?: SizeId;
  crust?: CrustId;
  quantity: number;
};

export const MAX_QUANTITY_PER_LINE = 20;
export const MAX_CART_LINES = 30;

export const SIZE_IDS = SIZES.map((s) => s.id) as [SizeId, ...SizeId[]];
export const CRUST_IDS = CRUSTS.map((c) => c.id) as [CrustId, ...CrustId[]];

export type AddToCartInput = {
  itemId: string;
  quantity: number;
  size?: SizeId;
  crust?: CrustId;
};

export type CartErrorCode =
  | "unknown_item"
  | "missing_size"
  | "invalid_option"
  | "invalid_quantity"
  | "quantity_limit"
  | "cart_full"
  | "unknown_line";

export type CartResult =
  | {
      ok: true;
      cart: CartLine[];
      /** The line that was added or changed (undefined when a line was removed). */
      line?: CartLine;
      /** True when the crust was not given and we used Hand-Tossed. */
      defaultedCrust: boolean;
      /** Short human-readable confirmation, e.g. "Added to cart: 2 × Large Beef Pepperoni". */
      message: string;
    }
  | { ok: false; code: CartErrorCode; error: string };

export function makeLineId(itemId: string, size?: SizeId, crust?: CrustId): string {
  return [itemId, size, crust].filter(Boolean).join(":");
}

/** e.g. "Large Beef Pepperoni (Cheese-Stuffed)" or "Garlic Bread". */
export function describeLine(line: Pick<CartLine, "itemId" | "size" | "crust">): string {
  const item = findMenuItem(line.itemId);
  const name = item?.name ?? line.itemId;
  if (!line.size) return name;
  const crust = line.crust ? ` (${crustName(line.crust)})` : "";
  return `${sizeName(line.size)} ${name}${crust}`;
}

function fail(code: CartErrorCode, error: string): CartResult {
  return { ok: false, code, error };
}

function isValidQuantity(q: number): boolean {
  return Number.isInteger(q) && q >= 1 && q <= MAX_QUANTITY_PER_LINE;
}

/**
 * Add an item to the cart. Pizzas need a size; a missing crust defaults to
 * Hand-Tossed (and `defaultedCrust` tells the caller to say so).
 * Adding the same item with the same options increases that line's quantity.
 */
export function addToCart(cart: CartLine[], input: AddToCartInput): CartResult {
  const item = findMenuItem(input.itemId);
  if (!item) return fail("unknown_item", `There is no menu item with ID "${input.itemId}".`);

  if (!isValidQuantity(input.quantity)) {
    return fail(
      "invalid_quantity",
      `Quantity must be a whole number from 1 to ${MAX_QUANTITY_PER_LINE}.`,
    );
  }

  let size: SizeId | undefined;
  let crust: CrustId | undefined;
  let defaultedCrust = false;

  if (item.kind === "pizza") {
    if (!input.size) {
      return fail("missing_size", `${item.name} needs a size: Regular or Large.`);
    }
    if (!SIZE_IDS.includes(input.size)) {
      return fail("invalid_option", `"${input.size}" is not a valid size. Choose Regular or Large.`);
    }
    if (input.crust !== undefined && !CRUST_IDS.includes(input.crust)) {
      return fail(
        "invalid_option",
        `"${input.crust}" is not a valid crust. Choose Hand-Tossed, Thin or Cheese-Stuffed.`,
      );
    }
    size = input.size;
    crust = input.crust ?? DEFAULT_CRUST;
    defaultedCrust = input.crust === undefined;
  } else if (input.size !== undefined || input.crust !== undefined) {
    return fail("invalid_option", `${item.name} does not have size or crust options.`);
  }

  const lineId = makeLineId(item.id, size, crust);
  const existing = cart.find((l) => l.lineId === lineId);

  if (existing) {
    const quantity = existing.quantity + input.quantity;
    if (quantity > MAX_QUANTITY_PER_LINE) {
      return fail(
        "quantity_limit",
        `You can have at most ${MAX_QUANTITY_PER_LINE} of one item. The cart already has ${existing.quantity}.`,
      );
    }
    const line = { ...existing, quantity };
    return {
      ok: true,
      cart: cart.map((l) => (l.lineId === lineId ? line : l)),
      line,
      defaultedCrust,
      message: `Added to cart: ${input.quantity} × ${describeLine(line)}`,
    };
  }

  if (cart.length >= MAX_CART_LINES) {
    return fail("cart_full", `The cart can hold at most ${MAX_CART_LINES} different items.`);
  }

  const line: CartLine = { lineId, itemId: item.id, quantity: input.quantity };
  if (size) line.size = size;
  if (crust) line.crust = crust;

  return {
    ok: true,
    cart: [...cart, line],
    line,
    defaultedCrust,
    message: `Added to cart: ${input.quantity} × ${describeLine(line)}`,
  };
}

/** Set a line's quantity. A quantity of 0 removes the line. */
export function updateCartLine(cart: CartLine[], lineId: string, quantity: number): CartResult {
  const existing = cart.find((l) => l.lineId === lineId);
  if (!existing) return fail("unknown_line", `There is no cart line with ID "${lineId}".`);

  if (quantity === 0) return removeCartLine(cart, lineId);

  if (!isValidQuantity(quantity)) {
    return fail(
      "invalid_quantity",
      `Quantity must be a whole number from 0 to ${MAX_QUANTITY_PER_LINE}.`,
    );
  }

  const line = { ...existing, quantity };
  return {
    ok: true,
    cart: cart.map((l) => (l.lineId === lineId ? line : l)),
    line,
    defaultedCrust: false,
    message: `Updated cart: ${quantity} × ${describeLine(line)}`,
  };
}

export function removeCartLine(cart: CartLine[], lineId: string): CartResult {
  const existing = cart.find((l) => l.lineId === lineId);
  if (!existing) return fail("unknown_line", `There is no cart line with ID "${lineId}".`);
  return {
    ok: true,
    cart: cart.filter((l) => l.lineId !== lineId),
    defaultedCrust: false,
    message: `Removed from cart: ${describeLine(existing)}`,
  };
}

// The cart arrives from the browser, so we treat it as untrusted.
const rawLineSchema = z.object({
  itemId: z.string().max(64),
  size: z.enum(SIZE_IDS).optional(),
  crust: z.enum(CRUST_IDS).optional(),
  quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
});

export const rawCartSchema = z.array(z.unknown()).max(100);

/**
 * Turn untrusted input into a valid cart: drop anything that is not a real
 * menu item with valid options, rebuild line IDs, and merge duplicates.
 * Any client-supplied price fields are ignored.
 */
export function sanitizeCart(raw: unknown): CartLine[] {
  const parsed = rawCartSchema.safeParse(raw);
  if (!parsed.success) return [];

  let cart: CartLine[] = [];
  for (const entry of parsed.data) {
    const line = rawLineSchema.safeParse(entry);
    if (!line.success) continue;
    const item = findMenuItem(line.data.itemId);
    if (!item) continue;
    // Pizzas must arrive with both options; we do not guess inside a stored cart.
    if (item.kind === "pizza" && (!line.data.size || !line.data.crust)) continue;
    const result = addToCart(cart, line.data);
    if (result.ok) cart = result.cart;
  }
  return cart;
}
