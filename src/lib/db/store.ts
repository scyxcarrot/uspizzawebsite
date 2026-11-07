// Where the catalogue is stored. Server only.
//
// - "neon": the Neon Postgres database in DATABASE_URL (Vercel Storage).
// - "memory": an in-process copy, used by the browser tests (DATA_STORE=memory)
//   so they never write to the real database.
// - none: no database configured. The site uses the original src/data files
//   and the admin page explains that changes can't be saved.

import { neon } from "@neondatabase/serverless";
import { catalogSchema, originalCatalog, type Catalog } from "@/lib/catalog";
import type { MenuItem } from "@/data/menu";
import type { Outlet } from "@/data/outlets";

export type AuditEntry = { at: string; summary: string };

export interface CatalogStore {
  kind: "neon" | "memory";
  /** Read the catalogue, creating and seeding the tables on first use. */
  load(): Promise<Catalog>;
  saveItem(item: MenuItem, summary: string): Promise<void>;
  saveOutlet(outlet: Outlet, summary: string): Promise<void>;
  reset(): Promise<void>;
  audit(limit?: number): Promise<AuditEntry[]>;
}

// ---------- Memory ----------

export function createMemoryStore(): CatalogStore {
  let catalog = originalCatalog();
  let log: AuditEntry[] = [];
  const note = (summary: string) => {
    log = [{ at: new Date().toISOString(), summary }, ...log].slice(0, 200);
  };
  return {
    kind: "memory",
    async load() {
      return structuredClone(catalog);
    },
    async saveItem(item, summary) {
      catalog.menu = catalog.menu.map((m) => (m.id === item.id ? structuredClone(item) : m));
      note(summary);
    },
    async saveOutlet(outlet, summary) {
      catalog.outlets = catalog.outlets.map((o) => (o.id === outlet.id ? structuredClone(outlet) : o));
      note(summary);
    },
    async reset() {
      catalog = originalCatalog();
      note("Reset to original data");
    },
    async audit(limit = 30) {
      return log.slice(0, limit);
    },
  };
}

// ---------- Neon Postgres ----------

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS menu_items (
     id text PRIMARY KEY,
     position int NOT NULL,
     data jsonb NOT NULL,
     price_sen int,
     regular_sen int,
     large_sen int,
     sold_out boolean NOT NULL DEFAULT false,
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS outlets (
     id text PRIMARY KEY,
     position int NOT NULL,
     data jsonb NOT NULL,
     opens_at int NOT NULL,
     closes_at int NOT NULL,
     closed_until timestamptz,
     closed_reason text,
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
     id bigserial PRIMARY KEY,
     at timestamptz NOT NULL DEFAULT now(),
     summary text NOT NULL
   )`,
];

type ItemRow = { data: MenuItem; price_sen: number | null; regular_sen: number | null; large_sen: number | null; sold_out: boolean };
type OutletRow = { data: Outlet; opens_at: number; closes_at: number; closed_until: string | Date | null; closed_reason: string | null };

/** Columns hold the editable fields (prices in sen, sold out, hours, closures); `data` holds the rest. */
function rowToItem(r: ItemRow): MenuItem {
  const item = structuredClone(r.data);
  if (item.kind === "pizza") item.priceBySize = { regular: r.regular_sen ?? item.priceBySize.regular, large: r.large_sen ?? item.priceBySize.large };
  else item.price = r.price_sen ?? item.price;
  if (r.sold_out) item.soldOut = true;
  else delete item.soldOut;
  return item;
}

function rowToOutlet(r: OutletRow): Outlet {
  const outlet = structuredClone(r.data);
  outlet.hours = { opensAt: r.opens_at, closesAt: r.closes_at };
  delete outlet.closedUntil;
  delete outlet.closedReason;
  if (r.closed_until) outlet.closedUntil = new Date(r.closed_until).toISOString();
  if (r.closed_reason) outlet.closedReason = r.closed_reason;
  return outlet;
}

function itemParams(item: MenuItem, position: number) {
  const { soldOut, ...data } = item;
  return [
    item.id,
    position,
    JSON.stringify(data),
    item.kind === "simple" ? item.price : null,
    item.kind === "pizza" ? item.priceBySize.regular : null,
    item.kind === "pizza" ? item.priceBySize.large : null,
    !!soldOut,
  ];
}

function outletParams(outlet: Outlet, position: number) {
  const { closedUntil, closedReason, ...data } = outlet;
  return [outlet.id, position, JSON.stringify(data), outlet.hours.opensAt, outlet.hours.closesAt, closedUntil ?? null, closedReason ?? null];
}

const UPSERT_ITEM = `INSERT INTO menu_items (id, position, data, price_sen, regular_sen, large_sen, sold_out)
  VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, price_sen = EXCLUDED.price_sen, regular_sen = EXCLUDED.regular_sen,
    large_sen = EXCLUDED.large_sen, sold_out = EXCLUDED.sold_out, updated_at = now()`;
const UPSERT_OUTLET = `INSERT INTO outlets (id, position, data, opens_at, closes_at, closed_until, closed_reason)
  VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
  ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, opens_at = EXCLUDED.opens_at, closes_at = EXCLUDED.closes_at,
    closed_until = EXCLUDED.closed_until, closed_reason = EXCLUDED.closed_reason, updated_at = now()`;

export function createNeonStore(url: string): CatalogStore {
  const sql = neon(url);
  let ready: Promise<void> | null = null;

  async function seed(catalog: Catalog, summary: string) {
    await sql.transaction([
      sql.query("DELETE FROM menu_items"),
      sql.query("DELETE FROM outlets"),
      ...catalog.menu.map((item, i) => sql.query(UPSERT_ITEM, itemParams(item, i))),
      ...catalog.outlets.map((o, i) => sql.query(UPSERT_OUTLET, outletParams(o, i))),
      sql.query("INSERT INTO audit_log (summary) VALUES ($1)", [summary]),
    ]);
  }

  function ensure(): Promise<void> {
    ready ??= (async () => {
      for (const statement of SCHEMA) await sql.query(statement);
      const rows = (await sql.query("SELECT (SELECT count(*) FROM menu_items) AS items, (SELECT count(*) FROM outlets) AS outlets")) as {
        items: string;
        outlets: string;
      }[];
      if (Number(rows[0]?.items) === 0 || Number(rows[0]?.outlets) === 0) await seed(originalCatalog(), "Seeded from the original data");
    })().catch((err) => {
      ready = null; // try again next time
      throw err;
    });
    return ready;
  }

  return {
    kind: "neon",
    async load() {
      await ensure();
      const [items, outlets] = await Promise.all([
        sql.query("SELECT data, price_sen, regular_sen, large_sen, sold_out FROM menu_items ORDER BY position"),
        sql.query("SELECT data, opens_at, closes_at, closed_until, closed_reason FROM outlets ORDER BY position"),
      ]);
      return catalogSchema.parse({
        menu: (items as ItemRow[]).map(rowToItem),
        outlets: (outlets as OutletRow[]).map(rowToOutlet),
      }) as Catalog;
    },
    async saveItem(item, summary) {
      await ensure();
      await sql.transaction([
        sql.query(
          "UPDATE menu_items SET data = $2::jsonb, price_sen = $3, regular_sen = $4, large_sen = $5, sold_out = $6, updated_at = now() WHERE id = $1",
          itemParams(item, 0).filter((_, i) => i !== 1),
        ),
        sql.query("INSERT INTO audit_log (summary) VALUES ($1)", [summary]),
      ]);
    },
    async saveOutlet(outlet, summary) {
      await ensure();
      await sql.transaction([
        sql.query(
          "UPDATE outlets SET data = $2::jsonb, opens_at = $3, closes_at = $4, closed_until = $5, closed_reason = $6, updated_at = now() WHERE id = $1",
          outletParams(outlet, 0).filter((_, i) => i !== 1),
        ),
        sql.query("INSERT INTO audit_log (summary) VALUES ($1)", [summary]),
      ]);
    },
    async reset() {
      await ensure();
      await seed(originalCatalog(), "Reset to original data");
    },
    async audit(limit = 30) {
      await ensure();
      const rows = (await sql.query("SELECT at, summary FROM audit_log ORDER BY id DESC LIMIT $1", [limit])) as { at: string | Date; summary: string }[];
      return rows.map((r) => ({ at: new Date(r.at).toISOString(), summary: r.summary }));
    },
  };
}

// ---------- Choosing the store ----------

const g = globalThis as unknown as { __catalogStore?: CatalogStore | null };

export function getStore(): CatalogStore | null {
  if (g.__catalogStore !== undefined) return g.__catalogStore;
  if (process.env.DATA_STORE === "memory") g.__catalogStore = createMemoryStore();
  else if (process.env.DATABASE_URL) g.__catalogStore = createNeonStore(process.env.DATABASE_URL);
  else g.__catalogStore = null;
  return g.__catalogStore;
}

/** For tests. */
export function setStoreForTests(store: CatalogStore | null | undefined) {
  g.__catalogStore = store;
}
