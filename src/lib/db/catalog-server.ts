// Server side of the live catalogue: read it from the store at most every
// couple of seconds, make it live (applyCatalog), and fall back to the
// original src/data files with a warning if the database is unavailable.

import { applyCatalog, currentCatalog, originalCatalog, type Catalog } from "@/lib/catalog";
import { getStore } from "@/lib/db/store";

export type CatalogSource = "database" | "memory" | "original";

/** How long one instance reuses what it read. Admin changes show up within this time. */
export const CATALOG_TTL_MS = 2000;
const DB_TIMEOUT_MS = 4000;

let cache: { at: number; source: CatalogSource } | null = null;
let lastWarning = 0;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

function warn(message: string) {
  // At most one warning a minute, so an outage doesn't flood the logs.
  if (Date.now() - lastWarning < 60_000) return;
  lastWarning = Date.now();
  console.warn(`[catalog] ${message} Using the original menu and outlet data.`);
}

/** Make the latest catalogue live in this server instance and return it. */
export async function loadCatalog(): Promise<{ catalog: Catalog; source: CatalogSource }> {
  if (cache && Date.now() - cache.at < CATALOG_TTL_MS) return { catalog: currentCatalog(), source: cache.source };
  const store = getStore();
  let source: CatalogSource = "original";
  if (!store) {
    applyCatalog(originalCatalog());
  } else {
    try {
      const catalog = await withTimeout(store.load(), DB_TIMEOUT_MS);
      if (!applyCatalog(catalog)) throw new Error("stored data failed validation");
      source = store.kind === "neon" ? "database" : "memory";
    } catch (err) {
      warn(`Database unavailable (${err instanceof Error ? err.message : "unknown error"}).`);
      applyCatalog(originalCatalog());
    }
  }
  cache = { at: Date.now(), source };
  return { catalog: currentCatalog(), source };
}

/** Called after an admin change so this instance shows it immediately. */
export function invalidateCatalog() {
  cache = null;
}
