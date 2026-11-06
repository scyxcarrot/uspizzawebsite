import { describe, expect, it } from "vitest";
import {
  MAX_QUANTITY_PER_LINE,
  addToCart,
  describeLine,
  removeCartLine,
  sanitizeCart,
  updateCartLine,
  type CartLine,
} from "@/lib/cart";

function mustAdd(cart: CartLine[], input: Parameters<typeof addToCart>[1]) {
  const r = addToCart(cart, input);
  if (!r.ok) throw new Error(r.error);
  return r;
}

describe("addToCart", () => {
  it("adds a pizza with size and crust", () => {
    const r = mustAdd([], { itemId: "beef-pepperoni", quantity: 2, size: "large", crust: "thin" });
    expect(r.cart).toEqual([
      { lineId: "beef-pepperoni:large:thin", itemId: "beef-pepperoni", size: "large", crust: "thin", quantity: 2 },
    ]);
    expect(r.defaultedCrust).toBe(false);
    expect(r.message).toBe("Added to cart: 2 × Large Beef Pepperoni (Thin)");
  });

  it("defaults only the crust to Hand-Tossed and reports it", () => {
    const r = mustAdd([], { itemId: "beef-pepperoni", quantity: 2, size: "large" });
    expect(r.cart[0]?.crust).toBe("hand-tossed");
    expect(r.defaultedCrust).toBe(true);
  });

  it("requires a size for pizzas", () => {
    const r = addToCart([], { itemId: "margherita", quantity: 1 });
    expect(r).toMatchObject({ ok: false, code: "missing_size" });
  });

  it("rejects unknown items", () => {
    expect(addToCart([], { itemId: "sushi", quantity: 1 })).toMatchObject({ ok: false, code: "unknown_item" });
  });

  it("rejects invalid options", () => {
    // @ts-expect-error testing untrusted input
    expect(addToCart([], { itemId: "margherita", quantity: 1, size: "huge" })).toMatchObject({
      ok: false,
      code: "invalid_option",
    });
    // @ts-expect-error testing untrusted input
    expect(addToCart([], { itemId: "margherita", quantity: 1, size: "large", crust: "deep-dish" })).toMatchObject({
      ok: false,
      code: "invalid_option",
    });
    expect(addToCart([], { itemId: "cola", quantity: 1, size: "large" })).toMatchObject({
      ok: false,
      code: "invalid_option",
    });
  });

  it("rejects bad quantities", () => {
    for (const quantity of [0, -1, 1.5, MAX_QUANTITY_PER_LINE + 1, Number.NaN]) {
      expect(addToCart([], { itemId: "cola", quantity })).toMatchObject({ ok: false, code: "invalid_quantity" });
    }
  });

  it("merges the same item and options into one line", () => {
    const first = mustAdd([], { itemId: "cola", quantity: 1 });
    const second = mustAdd(first.cart, { itemId: "cola", quantity: 2 });
    expect(second.cart).toHaveLength(1);
    expect(second.cart[0]?.quantity).toBe(3);
  });

  it("keeps different options on separate lines", () => {
    const a = mustAdd([], { itemId: "margherita", quantity: 1, size: "large", crust: "thin" });
    const b = mustAdd(a.cart, { itemId: "margherita", quantity: 1, size: "regular", crust: "thin" });
    expect(b.cart).toHaveLength(2);
  });

  it("enforces the per-line quantity limit when merging", () => {
    const a = mustAdd([], { itemId: "cola", quantity: MAX_QUANTITY_PER_LINE });
    expect(addToCart(a.cart, { itemId: "cola", quantity: 1 })).toMatchObject({ ok: false, code: "quantity_limit" });
  });

  it("does not mutate the input cart", () => {
    const cart: CartLine[] = [];
    mustAdd(cart, { itemId: "cola", quantity: 1 });
    expect(cart).toEqual([]);
  });
});

describe("updateCartLine and removeCartLine", () => {
  const cart = mustAdd([], { itemId: "cola", quantity: 2 }).cart;

  it("changes quantity", () => {
    const r = updateCartLine(cart, "cola", 5);
    expect(r.ok && r.cart[0]?.quantity).toBe(5);
  });

  it("removes a line when quantity is 0", () => {
    const r = updateCartLine(cart, "cola", 0);
    expect(r.ok && r.cart).toEqual([]);
  });

  it("removes a line directly", () => {
    const r = removeCartLine(cart, "cola");
    expect(r).toMatchObject({ ok: true, cart: [], message: "Removed from cart: Cola" });
  });

  it("rejects unknown line IDs", () => {
    expect(updateCartLine(cart, "nope", 1)).toMatchObject({ ok: false, code: "unknown_line" });
    expect(removeCartLine(cart, "nope")).toMatchObject({ ok: false, code: "unknown_line" });
  });

  it("rejects bad quantities", () => {
    expect(updateCartLine(cart, "cola", -1)).toMatchObject({ ok: false, code: "invalid_quantity" });
    expect(updateCartLine(cart, "cola", 2.5)).toMatchObject({ ok: false, code: "invalid_quantity" });
    expect(updateCartLine(cart, "cola", 99)).toMatchObject({ ok: false, code: "invalid_quantity" });
  });
});

describe("sanitizeCart", () => {
  it("keeps valid lines, ignores sent prices, and rebuilds line IDs", () => {
    const cart = sanitizeCart([
      { lineId: "hacked", itemId: "margherita", size: "large", crust: "thin", quantity: 1, unitPriceSen: 1 },
    ]);
    expect(cart).toEqual([
      { lineId: "margherita:large:thin", itemId: "margherita", size: "large", crust: "thin", quantity: 1 },
    ]);
  });

  it("drops invalid lines", () => {
    const cart = sanitizeCart([
      { itemId: "sushi", quantity: 1 },
      { itemId: "margherita", quantity: 1 }, // pizza missing options
      { itemId: "cola", quantity: 0 },
      { itemId: "cola", quantity: "5" },
      null,
      "garbage",
      { itemId: "cola", quantity: 2 },
    ]);
    expect(cart).toEqual([{ lineId: "cola", itemId: "cola", quantity: 2 }]);
  });

  it("returns an empty cart for non-array input", () => {
    expect(sanitizeCart("x")).toEqual([]);
    expect(sanitizeCart({ itemId: "cola" })).toEqual([]);
    expect(sanitizeCart(undefined)).toEqual([]);
  });
});

describe("describeLine", () => {
  it("describes pizzas and simple items", () => {
    expect(describeLine({ itemId: "seafood-deluxe", size: "large", crust: "cheese-stuffed" })).toBe(
      "Large Seafood Deluxe (Cheese-Stuffed)",
    );
    expect(describeLine({ itemId: "cola" })).toBe("Cola");
  });
});
