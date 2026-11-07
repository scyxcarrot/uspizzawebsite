import { afterEach, describe, expect, it, vi } from "vitest";
import { findMenuItem } from "@/data/menu";
import { applyCatalog, originalCatalog } from "@/lib/catalog";
import { runTool, type ToolContext } from "@/lib/chat/tools";
import { invalidateCatalog, loadCatalog } from "@/lib/db/catalog-server";
import { createMemoryStore, setStoreForTests, type CatalogStore } from "@/lib/db/store";

afterEach(() => {
  setStoreForTests(undefined);
  invalidateCatalog();
  applyCatalog(originalCatalog());
  vi.restoreAllMocks();
});

const ctx = (): ToolContext => ({
  cart: [],
  fulfilment: "delivery",
  browserOrders: [],
  now: new Date(),
  webSearch: async () => ({ ok: false, error: "not in tests" }) as never,
});

describe("data layer", () => {
  it("reads the catalogue from the store, so the menu and chatbot tools see the change", async () => {
    const store = createMemoryStore();
    setStoreForTests(store);
    const item = structuredClone(findMenuItem("garlic-bread")!);
    item.soldOut = true;
    await store.saveItem(item, "Garlic Bread: marked sold out");

    const { source } = await loadCatalog();
    expect(source).toBe("memory");
    expect(findMenuItem("garlic-bread")!.soldOut).toBe(true);

    const got = await runTool("get_item", { item: "garlic-bread" }, ctx());
    expect(JSON.stringify(got.result)).toMatch(/sold_out/);
    const add = await runTool("add_to_cart", { item: "garlic-bread", quantity: 1 }, ctx());
    expect(add.cart).toBeUndefined();
    expect(String(add.result.error)).toMatch(/sold out/);
    expect(await store.audit()).toEqual([expect.objectContaining({ summary: "Garlic Bread: marked sold out" })]);
  });

  it("reuses what it read for a moment, and invalidate forces a fresh read", async () => {
    const store = createMemoryStore();
    const load = vi.spyOn(store, "load");
    setStoreForTests(store);
    await loadCatalog();
    await loadCatalog();
    expect(load).toHaveBeenCalledTimes(1);
    invalidateCatalog();
    await loadCatalog();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("reset puts the original data back", async () => {
    const store = createMemoryStore();
    setStoreForTests(store);
    const item = structuredClone(findMenuItem("garlic-bread")!);
    item.soldOut = true;
    await store.saveItem(item, "x");
    await store.reset();
    invalidateCatalog();
    await loadCatalog();
    expect(findMenuItem("garlic-bread")!.soldOut).toBeUndefined();
  });
});

describe("fallback", () => {
  const broken = (load: () => Promise<never>): CatalogStore => ({ ...createMemoryStore(), kind: "neon", load });

  it("falls back to the original data with a warning when the database fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setStoreForTests(broken(() => Promise.reject(new Error("connection refused"))));
    const { source, catalog } = await loadCatalog();
    expect(source).toBe("original");
    expect(catalog.menu).toHaveLength(20);
    expect(findMenuItem("margherita")).toBeDefined();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/Database unavailable \(connection refused\)\. Using the original menu/));
  });

  it("falls back when the stored data is invalid", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    setStoreForTests({ ...createMemoryStore(), kind: "neon", load: async () => ({ menu: [], outlets: [] }) });
    const { source } = await loadCatalog();
    expect(source).toBe("original");
    expect(findMenuItem("margherita")).toBeDefined();
  });

  it("uses the original data when no database is configured", async () => {
    setStoreForTests(null);
    expect((await loadCatalog()).source).toBe("original");
  });
});
