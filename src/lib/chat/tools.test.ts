import { describe, expect, it, vi } from "vitest";
import { addToCart, type CartLine } from "@/lib/cart";
import { resolveItem, runTool, TOOL_DECLARATIONS, TOOL_INPUT_SCHEMAS, type ToolContext } from "@/lib/chat/tools";
import { sanitizeBrowserOrders } from "@/lib/orders";

function ctx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    cart: [],
    fulfilment: "delivery",
    browserOrders: [],
    now: new Date("2026-11-06T10:00:00Z"),
    webSearch: vi.fn(async () => ({ ok: true as const, answer: "Sunny, 31°C", sources: [{ title: "Met", url: "https://met.example/" }] })),
    ...overrides,
  };
}

type Item = { name: string; prices?: { regular: string }; price?: string; tags: string[] };
const names = (r: Record<string, unknown>) => (r.items as Item[]).map((i) => i.name);

describe("tool declarations", () => {
  it("has a validation schema for every declared tool", () => {
    for (const t of TOOL_DECLARATIONS) expect(TOOL_INPUT_SCHEMAS[t.name]).toBeDefined();
    expect(TOOL_DECLARATIONS).toHaveLength(8);
  });
});

describe("input validation for every tool", () => {
  const invalid: [string, unknown][] = [
    ["search_menu", { max_price_rm: -5 }],
    ["search_menu", { category: "sushi" }],
    ["search_menu", { dietary_tag: "Vegan" }],
    ["search_menu", { unexpected: true }],
    ["get_item", {}],
    ["get_item", { item: "" }],
    ["get_store_info", { topic: "secrets" }],
    ["get_order_status", {}],
    ["get_order_status", { order_id: "x".repeat(100) }],
    ["get_cart", { anything: 1 }],
    ["add_to_cart", { item: "cola" }],
    ["add_to_cart", { item: "cola", quantity: 0 }],
    ["add_to_cart", { item: "cola", quantity: 2.5 }],
    ["add_to_cart", { item: "margherita", quantity: 1, size: "huge" }],
    ["add_to_cart", { item: "margherita", quantity: 1, size: "large", crust: "deep" }],
    ["add_to_cart", { item: "cola", quantity: 1, price: 1 }],
    ["update_cart", { line_id: "cola" }],
    ["update_cart", { line_id: "cola", quantity: -1 }],
    ["web_search", { query: "" }],
    ["web_search", "not an object"],
  ];
  it.each(invalid)("%s rejects %j", async (name, args) => {
    const out = await runTool(name, args, ctx());
    expect(out.result.ok).toBe(false);
    expect(String(out.result.error)).toMatch(/Invalid arguments/);
    expect(out.cart).toBeUndefined();
  });

  it("rejects unknown tool names", async () => {
    expect((await runTool("set_price", { price: 1 }, ctx())).result).toMatchObject({ ok: false });
  });

  it("treats missing args as an empty object", async () => {
    expect((await runTool("get_cart", undefined, ctx())).result.ok).toBe(true);
  });
});

describe("search_menu", () => {
  it("lists the 8 pizzas", async () => {
    const { result } = await runTool("search_menu", { category: "pizzas" }, ctx());
    expect(result.count).toBe(8);
  });

  it("finds vegetarian pizzas", async () => {
    const { result } = await runTool("search_menu", { category: "pizzas", dietary_tag: "Vegetarian" }, ctx());
    expect(names(result)).toEqual(["Margherita", "Veggie Garden"]);
  });

  it("filters by max price and excludes beef", async () => {
    const { result } = await runTool("search_menu", { max_price_rm: 30, exclude: ["beef"] }, ctx());
    const list = result.items as Item[];
    expect(list.length).toBeGreaterThan(0);
    for (const i of list) expect(i.tags).not.toContain("Beef");
    expect(names(result)).not.toContain("Beef Bolognese");
    expect(names(result)).not.toContain("Seafood Deluxe"); // RM31
    expect(names(result)).toContain("Margherita");
  });

  it("returns nothing for items we don't sell", async () => {
    const { result } = await runTool("search_menu", { query: "sushi" }, ctx());
    expect(result.count).toBe(0);
  });
});

describe("get_item", () => {
  it("returns real details including allergens and crust options", async () => {
    const { result } = await runTool("get_item", { item: "Margherita" }, ctx());
    expect(result).toMatchObject({ found: true, item: { id: "margherita", allergens: ["gluten", "dairy"] } });
    expect(JSON.stringify(result)).toContain("cross-contact");
  });

  it("does not invent items", async () => {
    const { result } = await runTool("get_item", { item: "sushi platter" }, ctx());
    expect(result.found).toBe(false);
  });
});

describe("resolveItem", () => {
  it("resolves IDs, names and unique partial names", () => {
    expect(resolveItem("beef-pepperoni")?.id).toBe("beef-pepperoni");
    expect(resolveItem("Seafood Deluxe")?.id).toBe("seafood-deluxe");
    expect(resolveItem("pepperoni pizza")?.id).toBe("beef-pepperoni");
    expect(resolveItem("chicken")).toBeUndefined(); // ambiguous
  });
});

describe("get_store_info", () => {
  it("returns the halal and refund policy text", async () => {
    const halal = await runTool("get_store_info", { topic: "halal" }, ctx());
    expect(JSON.stringify(halal.result)).toContain("no halal certification information");
    expect(JSON.stringify(halal.result)).toContain("check with the store");
    const all = await runTool("get_store_info", { topic: "all" }, ctx());
    expect(JSON.stringify(all.result)).toContain("within 24 hours");
  });
});

describe("get_order_status", () => {
  it("finds seeded orders", async () => {
    const { result } = await runTool("get_order_status", { order_id: "US-1002" }, ctx());
    expect(result).toMatchObject({ found: true, status: "Out for delivery" });
  });

  it("finds browser orders with a computed status", async () => {
    const browserOrders = sanitizeBrowserOrders([
      { id: "US-2001", placedAt: "2026-11-06T09:59:00Z", fulfilment: "delivery", lines: [{ itemId: "cola", quantity: 1 }] },
    ]);
    const { result } = await runTool("get_order_status", { order_id: "us 2001" }, ctx({ browserOrders }));
    expect(result).toMatchObject({ found: true, status: "Preparing" });
  });

  it("does not invent unknown orders", async () => {
    const { result } = await runTool("get_order_status", { order_id: "US-9999" }, ctx());
    expect(result).toMatchObject({ found: false });
    expect(result.status).toBeUndefined();
  });
});

describe("cart tools", () => {
  it("adds 2 large pepperoni with the crust defaulted", async () => {
    const out = await runTool("add_to_cart", { item: "pepperoni", quantity: 2, size: "large" }, ctx());
    expect(out.cart).toEqual([
      { lineId: "beef-pepperoni:large:hand-tossed", itemId: "beef-pepperoni", size: "large", crust: "hand-tossed", quantity: 2 },
    ]);
    expect(out.cartMessage).toBe("Added to cart: 2 × Large Beef Pepperoni (Hand-Tossed)");
    expect(out.result.crust_defaulted_to_hand_tossed).toBe(true);
    expect(JSON.stringify(out.result)).toContain("RM 78.00");
  });

  it("asks for a size instead of guessing", async () => {
    const out = await runTool("add_to_cart", { item: "margherita", quantity: 1 }, ctx());
    expect(out.cart).toBeUndefined();
    expect(out.result).toMatchObject({ ok: false, ask_customer_for: "size (Regular or Large)" });
  });

  it("rejects unknown items", async () => {
    const out = await runTool("add_to_cart", { item: "sushi", quantity: 1 }, ctx());
    expect(out.result.ok).toBe(false);
  });

  it("removes a line and rejects invalid line IDs", async () => {
    const start = addToCart([], { itemId: "cola", quantity: 1 });
    const cart = (start.ok ? start.cart : []) as CartLine[];
    const removed = await runTool("update_cart", { line_id: "cola", quantity: 0 }, ctx({ cart }));
    expect(removed.cart).toEqual([]);
    const bad = await runTool("update_cart", { line_id: "nope", quantity: 1 }, ctx({ cart }));
    expect(bad.result).toMatchObject({ ok: false, current_line_ids: ["cola"] });
  });

  it("get_cart reports totals calculated by code", async () => {
    const start = addToCart([], { itemId: "beef-bolognese", quantity: 2 });
    const cart = start.ok ? start.cart : [];
    const { result } = await runTool("get_cart", {}, ctx({ cart }));
    expect(result.cart).toMatchObject({ subtotal: "RM 40.00", delivery_fee: "RM 5.00", total: "RM 45.00" });
  });
});

describe("web_search", () => {
  it("returns the answer as untrusted data with sources", async () => {
    const out = await runTool("web_search", { query: "weather KL" }, ctx());
    expect(out.sources).toEqual([{ title: "Met", url: "https://met.example/" }]);
    expect(out.result.untrusted_web_summary).toBe("Sunny, 31°C");
  });

  it("says live info is unavailable when search fails", async () => {
    const out = await runTool(
      "web_search",
      { query: "news" },
      ctx({ webSearch: async () => ({ ok: false, error: "This demo can't check live information right now." }) }),
    );
    expect(out.result.ok).toBe(false);
    expect(out.sources).toBeUndefined();
    const instruction = String(out.result.instruction);
    expect(instruction).toMatch(/this demo can't check live information right now/);
    expect(instruction).toMatch(/suggest a suitable source/);
    expect(instruction).toMatch(/do not guess/i);
  });
});
