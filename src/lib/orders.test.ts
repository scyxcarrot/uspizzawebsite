import { describe, expect, it } from "vitest";
import { SEEDED_ORDERS } from "@/data/orders";
import {
  canCancelFree,
  createOrder,
  findOrder,
  getOrderStatus,
  nextOrderId,
  normaliseOrderId,
  sanitizeBrowserOrders,
  statusFromElapsedMs,
  statusLabel,
} from "@/lib/orders";

const s = (seconds: number) => seconds * 1000;

describe("statusFromElapsedMs", () => {
  it("follows the demo timings", () => {
    expect(statusFromElapsedMs(s(0))).toBe("received");
    expect(statusFromElapsedMs(s(29.9))).toBe("received");
    expect(statusFromElapsedMs(s(30))).toBe("preparing");
    expect(statusFromElapsedMs(s(89))).toBe("preparing");
    expect(statusFromElapsedMs(s(90))).toBe("baking");
    expect(statusFromElapsedMs(s(149))).toBe("baking");
    expect(statusFromElapsedMs(s(150))).toBe("out-for-delivery");
    expect(statusFromElapsedMs(s(239))).toBe("out-for-delivery");
    expect(statusFromElapsedMs(s(240))).toBe("delivered");
    expect(statusFromElapsedMs(s(10_000))).toBe("delivered");
  });

  it("treats a future placement time (clock skew) as just received", () => {
    expect(statusFromElapsedMs(s(-60))).toBe("received");
  });
});

describe("getOrderStatus", () => {
  const placedAt = "2026-11-06T10:00:00.000Z";
  it("uses elapsed time for new orders", () => {
    expect(getOrderStatus({ placedAt }, new Date("2026-11-06T10:01:40.000Z"))).toBe("baking");
  });

  it("uses the fixed status for seeded orders", () => {
    expect(getOrderStatus({ placedAt, fixedStatus: "delivered" }, new Date(placedAt))).toBe("delivered");
  });

  it("falls back to received for a bad timestamp", () => {
    expect(getOrderStatus({ placedAt: "nonsense" }, new Date())).toBe("received");
  });
});

describe("statusLabel", () => {
  it("uses pickup wording for pickup orders", () => {
    expect(statusLabel("out-for-delivery", "delivery")).toBe("Out for delivery");
    expect(statusLabel("out-for-delivery", "pickup")).toBe("Ready for pickup");
    expect(statusLabel("delivered", "pickup")).toBe("Collected");
  });
});

describe("canCancelFree", () => {
  it("allows free cancellation until Baking", () => {
    expect(canCancelFree("received")).toBe(true);
    expect(canCancelFree("preparing")).toBe(true);
    expect(canCancelFree("baking")).toBe(false);
  });
});

describe("order IDs", () => {
  it("starts new orders at US-2001", () => {
    expect(nextOrderId([])).toBe("US-2001");
    expect(nextOrderId(["US-1001", "US-1002"])).toBe("US-2001");
  });

  it("continues from the highest existing ID", () => {
    expect(nextOrderId(["US-2001", "US-2005", "US-2003", "junk"])).toBe("US-2006");
  });

  it("normalises friendly input", () => {
    expect(normaliseOrderId("US-1002")).toBe("US-1002");
    expect(normaliseOrderId(" us1002 ")).toBe("US-1002");
    expect(normaliseOrderId("#US 1002")).toBe("US-1002");
    expect(normaliseOrderId("1002")).toBe("US-1002");
    expect(normaliseOrderId("US-12")).toBeNull();
    expect(normaliseOrderId("hello")).toBeNull();
  });
});

describe("seeded orders", () => {
  it("have the required fixed statuses", () => {
    const now = new Date();
    expect(SEEDED_ORDERS.map((o) => [o.id, getOrderStatus(o, now)])).toEqual([
      ["US-1001", "delivered"],
      ["US-1002", "out-for-delivery"],
      ["US-1003", "preparing"],
    ]);
  });

  it("have totals that match the menu", () => {
    const [o1, o2, o3] = SEEDED_ORDERS;
    expect(o1).toMatchObject({ subtotalSen: 5300, deliveryFeeSen: 0, totalSen: 5300 });
    expect(o2).toMatchObject({ subtotalSen: 4800, deliveryFeeSen: 500, totalSen: 5300 });
    expect(o3).toMatchObject({ subtotalSen: 7200, deliveryFeeSen: 0, totalSen: 7200 });
  });
});

describe("createOrder", () => {
  it("recalculates totals and drops the address for pickup", () => {
    const order = createOrder({
      id: "US-2001",
      placedAt: new Date("2026-11-06T10:00:00Z"),
      fulfilment: "pickup",
      customer: { name: "Test", phone: "0123456789", address: "should be dropped" },
      cart: [{ lineId: "cola", itemId: "cola", quantity: 2 }],
    });
    expect(order).toMatchObject({ subtotalSen: 1000, deliveryFeeSen: 0, totalSen: 1000 });
    expect(order.customer.address).toBeUndefined();
  });
});

describe("sanitizeBrowserOrders", () => {
  it("recalculates prices and ignores tampered totals", () => {
    const [order] = sanitizeBrowserOrders([
      {
        id: "US-2001",
        placedAt: "2026-11-06T10:00:00.000Z",
        fulfilment: "delivery",
        customer: { name: "A", phone: "0123456789", address: "Somewhere 123" },
        lines: [{ itemId: "cola", quantity: 1, unitPriceSen: 1 }],
        totalSen: 1,
      },
    ]);
    expect(order).toMatchObject({ subtotalSen: 500, deliveryFeeSen: 500, totalSen: 1000 });
  });

  it("rejects malformed orders and IDs that impersonate seeded orders", () => {
    const orders = sanitizeBrowserOrders([
      { id: "US-1002", placedAt: "2026-11-06T10:00:00Z", fulfilment: "delivery", lines: [] },
      { id: "bad", placedAt: "2026-11-06T10:00:00Z", fulfilment: "delivery", lines: [] },
      { id: "US-2002", placedAt: "not a date", fulfilment: "delivery", lines: [] },
      "junk",
    ]);
    expect(orders).toEqual([]);
    expect(sanitizeBrowserOrders("nope")).toEqual([]);
  });
});

describe("findOrder", () => {
  it("finds seeded and browser orders, and returns undefined otherwise", () => {
    const browser = sanitizeBrowserOrders([
      { id: "US-2001", placedAt: "2026-11-06T10:00:00Z", fulfilment: "pickup", lines: [] },
    ]);
    expect(findOrder("us-1002", SEEDED_ORDERS, browser)?.id).toBe("US-1002");
    expect(findOrder("US-2001", SEEDED_ORDERS, browser)?.id).toBe("US-2001");
    expect(findOrder("US-9999", SEEDED_ORDERS, browser)).toBeUndefined();
    expect(findOrder("pizza", SEEDED_ORDERS, browser)).toBeUndefined();
  });
});

describe("orders keep their outlet", () => {
  it("stores a real outlet and drops an unknown one", async () => {
    const { createOrder: create, sanitizeBrowserOrders: sanitize } = await import("@/lib/orders");
    const base = { id: "US-2001", placedAt: new Date(), cart: [{ lineId: "cola", itemId: "cola", quantity: 1 }], fulfilment: "pickup" as const, customer: { name: "A", phone: "0123456789" } };
    expect(create({ ...base, outletId: "klcc" }).outletId).toBe("klcc");
    expect(create({ ...base, outletId: "atlantis" }).outletId).toBeUndefined();
    expect(sanitize([{ ...create({ ...base, outletId: "bangsar" }), lines: base.cart }])[0]?.outletId).toBe("bangsar");
  });

  it("seeded orders have outlets", async () => {
    const { SEEDED_ORDERS } = await import("@/data/orders");
    expect(SEEDED_ORDERS.every((o) => o.outletId)).toBe(true);
  });
});
