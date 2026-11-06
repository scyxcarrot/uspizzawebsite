import { describe, expect, it } from "vitest";
import { MENU, findMenuItem, startingPrice } from "@/data/menu";
import { formatRM } from "@/lib/money";
import { deliveryFeeSen, meetsDeliveryMinimum, priceCart, unitPriceSen } from "@/lib/pricing";
import type { CartLine } from "@/lib/cart";

const item = (id: string) => {
  const found = findMenuItem(id);
  if (!found) throw new Error(`missing ${id}`);
  return found;
};

describe("menu data", () => {
  it("has the 20 items from the brief with unique IDs", () => {
    expect(MENU).toHaveLength(20);
    expect(new Set(MENU.map((i) => i.id)).size).toBe(20);
  });

  it("has exactly 8 pizzas", () => {
    expect(MENU.filter((i) => i.kind === "pizza").map((i) => i.name)).toEqual([
      "Margherita",
      "Beef Pepperoni",
      "BBQ Chicken Feast",
      "Hawaiian Chicken",
      "Spicy Sambal Chicken",
      "Veggie Garden",
      "Seafood Deluxe",
      "Meat Lovers",
    ]);
  });

  it("stores prices as whole sen", () => {
    for (const i of MENU) {
      const prices = i.kind === "pizza" ? Object.values(i.priceBySize) : [i.price];
      for (const p of prices) expect(Number.isInteger(p)).toBe(true);
    }
  });

  it("starting price is the Regular price for pizzas", () => {
    expect(startingPrice(item("margherita"))).toBe(2200);
    expect(startingPrice(item("cola"))).toBe(500);
  });
});

describe("unitPriceSen", () => {
  it("prices pizzas by size", () => {
    expect(unitPriceSen(item("margherita"), "regular", "hand-tossed")).toBe(2200);
    expect(unitPriceSen(item("margherita"), "large", "hand-tossed")).toBe(3400);
  });

  it("charges nothing extra for thin or hand-tossed crust", () => {
    expect(unitPriceSen(item("beef-pepperoni"), "large", "thin")).toBe(3900);
    expect(unitPriceSen(item("beef-pepperoni"), "large", "hand-tossed")).toBe(3900);
  });

  it("adds RM5 for cheese-stuffed crust", () => {
    // Acceptance test 4: large Seafood Deluxe with cheese-stuffed crust = RM51
    expect(unitPriceSen(item("seafood-deluxe"), "large", "cheese-stuffed")).toBe(5100);
    expect(unitPriceSen(item("margherita"), "regular", "cheese-stuffed")).toBe(2700);
  });

  it("uses the fixed price for non-pizza items", () => {
    expect(unitPriceSen(item("garlic-bread"))).toBe(900);
  });

  it("refuses to price a pizza without options", () => {
    expect(() => unitPriceSen(item("margherita"))).toThrow();
  });
});

describe("delivery fee", () => {
  it("is RM5 below RM50", () => {
    expect(deliveryFeeSen(4500, "delivery")).toBe(500); // acceptance test 8
    expect(deliveryFeeSen(4999, "delivery")).toBe(500);
  });

  it("is free at exactly RM50 and above", () => {
    expect(deliveryFeeSen(5000, "delivery")).toBe(0);
    expect(deliveryFeeSen(9000, "delivery")).toBe(0);
  });

  it("is free for pickup and for an empty cart", () => {
    expect(deliveryFeeSen(2000, "pickup")).toBe(0);
    expect(deliveryFeeSen(0, "delivery")).toBe(0);
  });
});

describe("minimum delivery order", () => {
  it("requires RM20 of food", () => {
    expect(meetsDeliveryMinimum(1999)).toBe(false);
    expect(meetsDeliveryMinimum(2000)).toBe(true);
  });
});

describe("priceCart", () => {
  const cart: CartLine[] = [
    { lineId: "beef-pepperoni:large:hand-tossed", itemId: "beef-pepperoni", size: "large", crust: "hand-tossed", quantity: 2 },
    { lineId: "cola", itemId: "cola", quantity: 1 },
  ];

  it("totals a delivery order over RM50 with free delivery", () => {
    const s = priceCart(cart, "delivery");
    expect(s.subtotalSen).toBe(2 * 3900 + 500);
    expect(s.deliveryFeeSen).toBe(0);
    expect(s.totalSen).toBe(8300);
    expect(s.itemCount).toBe(3);
    expect(s.meetsMinimum).toBe(true);
    expect(s.lines[0]).toMatchObject({ unitPriceSen: 3900, lineTotalSen: 7800, optionsLabel: "Large · Hand-Tossed" });
  });

  it("adds the delivery fee below RM50 and reports the gap", () => {
    const s = priceCart([{ lineId: "beef-bolognese", itemId: "beef-bolognese", quantity: 2 }], "delivery");
    expect(s.subtotalSen).toBe(4000);
    expect(s.deliveryFeeSen).toBe(500);
    expect(s.totalSen).toBe(4500);
    expect(s.amountToFreeDeliverySen).toBe(1000);
  });

  it("blocks delivery below the minimum but allows pickup", () => {
    const small: CartLine[] = [{ lineId: "garlic-bread", itemId: "garlic-bread", quantity: 1 }];
    const delivery = priceCart(small, "delivery");
    expect(delivery.meetsMinimum).toBe(false);
    expect(delivery.amountToMinimumSen).toBe(1100);
    const pickup = priceCart(small, "pickup");
    expect(pickup.meetsMinimum).toBe(true);
    expect(pickup.deliveryFeeSen).toBe(0);
    expect(pickup.totalSen).toBe(900);
  });

  it("drops lines for unknown items", () => {
    const s = priceCart([{ lineId: "sushi", itemId: "sushi", quantity: 1 }]);
    expect(s.lines).toHaveLength(0);
    expect(s.totalSen).toBe(0);
  });

  it("handles an empty cart", () => {
    const s = priceCart([]);
    expect(s).toMatchObject({ subtotalSen: 0, deliveryFeeSen: 0, totalSen: 0, amountToFreeDeliverySen: 0 });
  });
});

describe("formatRM", () => {
  it("formats sen as ringgit", () => {
    expect(formatRM(2200)).toBe("RM 22.00");
    expect(formatRM(5)).toBe("RM 0.05");
    expect(formatRM(123456)).toBe("RM 1,234.56");
    expect(formatRM(0)).toBe("RM 0.00");
  });
});
