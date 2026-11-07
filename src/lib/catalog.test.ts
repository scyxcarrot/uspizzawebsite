import { afterEach, describe, expect, it } from "vitest";
import { MENU, findMenuItem } from "@/data/menu";
import { OUTLETS, findOutlet } from "@/data/outlets";
import { addLinesToCart, addToCart, sanitizeCart, updateCartLine } from "@/lib/cart";
import {
  applyCatalog,
  applyItemChange,
  applyOutletChange,
  catalogVersion,
  currentCatalog,
  itemChangeSchema,
  originalCatalog,
  outletChangeSchema,
} from "@/lib/catalog";
import { validateCheckout } from "@/lib/checkout";
import { isOpenAt } from "@/lib/outlets";
import { planOrder } from "@/lib/planner";
import { priceCart } from "@/lib/pricing";

afterEach(() => {
  applyCatalog(originalCatalog());
});

function withSoldOut(...ids: string[]) {
  const c = originalCatalog();
  for (const item of c.menu) if (ids.includes(item.id)) item.soldOut = true;
  expect(applyCatalog(c)).toBe(true);
}

/** 2 pm Malaysia time on a fixed day. */
const AFTERNOON = new Date("2026-11-07T06:00:00Z");

describe("live catalogue", () => {
  it("applies a valid catalogue in place, so every reader sees it", () => {
    const c = originalCatalog();
    const item = c.menu.find((m) => m.id === "garlic-bread")!;
    if (item.kind === "simple") item.price = 1234;
    expect(applyCatalog(c)).toBe(true);
    const live = findMenuItem("garlic-bread")!;
    expect(live.kind === "simple" && live.price).toBe(1234);
    expect(priceCart([{ lineId: "garlic-bread", itemId: "garlic-bread", quantity: 2 }]).subtotalSen).toBe(2468);
  });

  it("rejects an invalid catalogue and keeps the current one", () => {
    const before = catalogVersion(currentCatalog());
    expect(applyCatalog({ menu: [{ id: "x", kind: "pizza", name: "Bad" }], outlets: [] })).toBe(false);
    expect(applyCatalog(null)).toBe(false);
    const c = originalCatalog();
    (c.menu[0] as { priceBySize: { regular: number } }).priceBySize.regular = 12.5; // not whole sen
    expect(applyCatalog(c)).toBe(false);
    expect(catalogVersion(currentCatalog())).toBe(before);
    expect(MENU).toHaveLength(20);
    expect(OUTLETS).toHaveLength(6);
  });

  it("gives the same version for the same data and a new one after a change", () => {
    const a = originalCatalog();
    const b = originalCatalog();
    expect(catalogVersion(a)).toBe(catalogVersion(b));
    b.menu[0]!.soldOut = true;
    expect(catalogVersion(a)).not.toBe(catalogVersion(b));
  });
});

describe("sold out", () => {
  it("can't be added to the cart, and the message says so", () => {
    withSoldOut("garlic-bread");
    const r = addToCart([], { itemId: "garlic-bread", quantity: 1 });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.code).toBe("sold_out");
    expect(!r.ok && r.error).toMatch(/Garlic Bread is sold out/);
  });

  it("can't be increased, but can be reduced or removed", () => {
    const cart = addToCart([], { itemId: "garlic-bread", quantity: 2 });
    expect(cart.ok).toBe(true);
    withSoldOut("garlic-bread");
    const lines = cart.ok ? cart.cart : [];
    expect(updateCartLine(lines, "garlic-bread", 3).ok).toBe(false);
    expect(updateCartLine(lines, "garlic-bread", 1).ok).toBe(true);
    expect(updateCartLine(lines, "garlic-bread", 0).ok).toBe(true);
  });

  it("stays in a saved cart, marked sold out, and blocks checkout until removed", () => {
    withSoldOut("garlic-bread");
    const cart = sanitizeCart([{ itemId: "garlic-bread", quantity: 3 }, { itemId: "margherita", size: "large", crust: "thin", quantity: 1 }]);
    expect(cart).toHaveLength(2);
    const summary = priceCart(cart, "pickup");
    expect(summary.lines.find((l) => l.itemId === "garlic-bread")?.soldOut).toBe(true);
    expect(summary.soldOutNames).toEqual(["Garlic Bread"]);
    const errors = validateCheckout({ fulfilment: "pickup", name: "Siti", phone: "0123456789", address: "", outletId: "bangsar" }, summary, AFTERNOON);
    expect(errors.cart).toMatch(/Garlic Bread is sold out\. Please remove it/);
  });

  it("is never put in a group order plan, and a plan with it can't be added", () => {
    withSoldOut("margherita");
    const plan = planOrder({ people: 6, budgetSen: 20000, vegetarians: 2, fulfilment: "delivery" });
    expect(plan.ok).toBe(true);
    expect(plan.ok && plan.lines.some((l) => l.itemId === "margherita")).toBe(false);
    const r = addLinesToCart([], [{ lineId: "x", itemId: "margherita", size: "large", crust: "hand-tossed", quantity: 1 }]);
    expect(r.ok).toBe(false);
  });
});

describe("outlet closures", () => {
  it("a temporary closure makes the outlet closed and checkout is blocked", () => {
    const c = originalCatalog();
    const bangsar = c.outlets.find((o) => o.id === "bangsar")!;
    bangsar.closedUntil = new Date(AFTERNOON.getTime() + 2 * 3600_000).toISOString();
    bangsar.closedReason = "Kitchen maintenance";
    applyCatalog(c);
    const outlet = findOutlet("bangsar")!;
    expect(isOpenAt(outlet, AFTERNOON)).toBe(false);
    expect(isOpenAt(outlet, new Date(AFTERNOON.getTime() + 3 * 3600_000))).toBe(true);
    const cart = addToCart([], { itemId: "garlic-bread", quantity: 3 });
    const errors = validateCheckout(
      { fulfilment: "pickup", name: "Siti", phone: "0123456789", address: "", outletId: "bangsar" },
      priceCart(cart.ok ? cart.cart : [], "pickup"),
      AFTERNOON,
    );
    expect(errors.outlet).toMatch(/temporarily closed until 7 Nov, 4:00 pm \(Kitchen maintenance\)\. Please choose another outlet\./);
  });

  it("outside its hours an outlet can't take orders", () => {
    const night = new Date("2026-11-07T19:00:00Z"); // 3 am Malaysia time
    const errors = validateCheckout(
      { fulfilment: "pickup", name: "Siti", phone: "0123456789", address: "", outletId: "klcc" },
      priceCart([{ lineId: "garlic-bread", itemId: "garlic-bread", quantity: 3 }], "pickup"),
      night,
    );
    expect(errors.outlet).toMatch(/closed right now\. It opens at 10:00 am/);
  });
});

describe("admin change validation", () => {
  it("accepts valid changes and rejects bad ones with clear messages", () => {
    expect(itemChangeSchema.safeParse({ id: "garlic-bread", priceRM: 12.9 }).success).toBe(true);
    const cases: [unknown, RegExp][] = [
      [{ id: "garlic-bread", priceRM: 0.1 }, /at least RM 0.50/],
      [{ id: "garlic-bread", priceRM: 9999 }, /at most RM 500/],
      [{ id: "garlic-bread", priceRM: 12.345 }, /two decimal places/],
      [{ id: "garlic-bread", priceRM: "12" }, /price in RM/],
      [{ id: "garlic-bread", description: "short" }, /at least 10 characters/],
      [{ id: "garlic-bread", soldOut: "yes" }, /./],
    ];
    for (const [input, message] of cases) {
      const r = itemChangeSchema.safeParse(input);
      expect(r.success, JSON.stringify(input)).toBe(false);
      expect(r.error?.issues[0]?.message).toMatch(message);
    }
    // Unknown fields (e.g. trying to set a name or image) are rejected.
    expect(itemChangeSchema.safeParse({ id: "garlic-bread", name: "Free" }).success).toBe(false);
    expect(outletChangeSchema.safeParse({ id: "klcc", opensAt: "25:00" }).success).toBe(false);
    expect(outletChangeSchema.safeParse({ id: "klcc", closure: { hours: 0, reason: "" } }).success).toBe(false);
    expect(outletChangeSchema.safeParse({ id: "klcc", closure: { hours: 2, reason: "Staff training" } }).success).toBe(true);
  });

  it("converts RM to sen in code and summarises the change for the audit log", () => {
    const item = findMenuItem("margherita")!;
    const r = applyItemChange(item, { id: "margherita", regularRM: 23.9, largeRM: 35.5 });
    expect(r.ok).toBe(true);
    if (r.ok && r.value.kind === "pizza") {
      expect(r.value.priceBySize).toEqual({ regular: 2390, large: 3550 });
      expect(r.summary).toBe("Margherita: price 2200/3400 → 2390/3550 sen");
    }
    expect(applyItemChange(item, { id: "margherita", regularRM: 40 }).ok).toBe(false); // Large below Regular
    expect(applyItemChange(item, { id: "margherita", priceRM: 10 }).ok).toBe(false);
    expect(applyItemChange(item, { id: "margherita" }).ok).toBe(false);
    const sold = applyItemChange(item, { id: "margherita", soldOut: true });
    expect(sold.ok && sold.value.soldOut).toBe(true);
    expect(sold.ok && sold.summary).toBe("Margherita: marked sold out");
    // The original is not changed until the store saves it.
    expect(findMenuItem("margherita")!.soldOut).toBeUndefined();
  });

  it("sets and clears outlet hours and closures", () => {
    const outlet = findOutlet("klcc")!;
    const hours = applyOutletChange(outlet, { id: "klcc", opensAt: "09:00", closesAt: "23:30" });
    expect(hours.ok && hours.value.hours).toEqual({ opensAt: 540, closesAt: 1410 });
    expect(applyOutletChange(outlet, { id: "klcc", opensAt: "10:00", closesAt: "10:00" }).ok).toBe(false);
    const closed = applyOutletChange(outlet, { id: "klcc", closure: { hours: 2, reason: "Staff training" } }, AFTERNOON);
    expect(closed.ok && closed.value.closedUntil).toBe("2026-11-07T08:00:00.000Z");
    expect(closed.ok && closed.summary).toBe("KLCC Outlet: closed for 2 h (Staff training)");
    if (closed.ok) {
      const reopened = applyOutletChange(closed.value, { id: "klcc", closure: null });
      expect(reopened.ok && reopened.value.closedUntil).toBeUndefined();
    }
  });
});
