// Check the database connection: creates and seeds the tables if needed, then
// prints how many items and outlets it holds. Prints no connection details.
//
//   npx tsx --env-file=.env.development.local scripts/db-check.ts

import { createNeonStore } from "@/lib/db/store";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const store = createNeonStore(url);
  const started = Date.now();
  const catalog = await store.load();
  const audit = await store.audit(5);
  console.log(`Connected in ${Date.now() - started} ms.`);
  console.log(`Menu items: ${catalog.menu.length}, sold out: ${catalog.menu.filter((m) => m.soldOut).length}`);
  console.log(`Outlets: ${catalog.outlets.length}, temporarily closed: ${catalog.outlets.filter((o) => o.closedUntil).length}`);
  console.log(`Latest audit entries: ${audit.map((a) => a.summary).join(" | ") || "none"}`);

  // --roundtrip: save a change, read it back, then reset to the original data.
  if (process.argv.includes("--roundtrip")) {
    const item = structuredClone(catalog.menu.find((m) => m.id === "garlic-bread")!);
    item.soldOut = true;
    if (item.kind === "simple") item.price = 1290;
    await store.saveItem(item, "db-check: Garlic Bread sold out, RM 12.90");
    const outlet = structuredClone(catalog.outlets.find((o) => o.id === "klcc")!);
    outlet.closedUntil = new Date(Date.now() + 3600_000).toISOString();
    outlet.closedReason = "db-check";
    outlet.hours = { opensAt: 540, closesAt: 1380 };
    await store.saveOutlet(outlet, "db-check: KLCC closed for 1 h");
    const after = await store.load();
    const gb = after.menu.find((m) => m.id === "garlic-bread")!;
    const k = after.outlets.find((o) => o.id === "klcc")!;
    console.log(`After save: Garlic Bread soldOut=${gb.soldOut} price=${gb.kind === "simple" ? gb.price : "?"}; KLCC closedUntil set=${!!k.closedUntil} reason=${k.closedReason} hours=${k.hours.opensAt}-${k.hours.closesAt}; order kept=${after.menu[8]?.id === "garlic-bread"}`);
    await store.reset();
    const reset = await store.load();
    const gb2 = reset.menu.find((m) => m.id === "garlic-bread")!;
    console.log(`After reset: Garlic Bread soldOut=${gb2.soldOut ?? false}; KLCC closed=${!!reset.outlets.find((o) => o.id === "klcc")!.closedUntil}; items=${reset.menu.length}`);
    console.log(`Audit: ${(await store.audit(4)).map((a) => a.summary).join(" | ")}`);
  }
}

main().catch((err) => {
  console.error("Database check failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
