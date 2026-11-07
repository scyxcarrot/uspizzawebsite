// Applying admin changes on the server: check the session, validate with Zod,
// save to the store with an audit entry, and refresh the live catalogue.

import { isAdminRequest, sameOrigin } from "@/lib/admin/auth";
import { applyItemChange, applyOutletChange, itemChangeSchema, outletChangeSchema, zodMessage } from "@/lib/catalog";
import { invalidateCatalog, loadCatalog } from "@/lib/db/catalog-server";
import { getStore, type CatalogStore } from "@/lib/db/store";

const noStore = { "Cache-Control": "no-store" };
const fail = (error: string, status = 400) => Response.json({ ok: false, error }, { status, headers: noStore });

type Guarded = { ok: true; store: CatalogStore; body: unknown } | { ok: false; response: Response };

async function guard(req: Request): Promise<Guarded> {
  if (!sameOrigin(req)) return { ok: false, response: fail("Bad request.", 403) };
  if (!isAdminRequest(req)) return { ok: false, response: fail("Please sign in again.", 401) };
  const store = getStore();
  if (!store) return { ok: false, response: fail("No database is connected, so changes can't be saved.", 503) };
  const body = await req.json().catch(() => null);
  return { ok: true, store, body };
}

async function save(run: () => Promise<void>, summary: string) {
  try {
    await run();
  } catch (err) {
    console.warn("[admin] could not save a change:", err instanceof Error ? err.message : "unknown error");
    return fail("The database is unavailable, so the change wasn't saved. Please try again.", 503);
  }
  invalidateCatalog();
  await loadCatalog();
  return Response.json({ ok: true, summary }, { headers: noStore });
}

/** Read the freshest copy before changing it, so two quick edits don't overwrite each other. */
async function fresh() {
  invalidateCatalog();
  return (await loadCatalog()).catalog;
}

export async function handleItemChange(req: Request) {
  const g = await guard(req);
  if (!g.ok) return g.response;
  const parsed = itemChangeSchema.safeParse(g.body);
  if (!parsed.success) return fail(zodMessage(parsed.error));
  const item = (await fresh()).menu.find((m) => m.id === parsed.data.id);
  if (!item) return fail("There is no menu item with that ID.", 404);
  const r = applyItemChange(item, parsed.data);
  if (!r.ok) return fail(r.error);
  return save(() => g.store.saveItem(r.value, r.summary), r.summary);
}

export async function handleOutletChange(req: Request) {
  const g = await guard(req);
  if (!g.ok) return g.response;
  const parsed = outletChangeSchema.safeParse(g.body);
  if (!parsed.success) return fail(zodMessage(parsed.error));
  const outlet = (await fresh()).outlets.find((o) => o.id === parsed.data.id);
  if (!outlet) return fail("There is no outlet with that ID.", 404);
  const r = applyOutletChange(outlet, parsed.data);
  if (!r.ok) return fail(r.error);
  return save(() => g.store.saveOutlet(r.value, r.summary), r.summary);
}

export async function handleReset(req: Request) {
  const g = await guard(req);
  if (!g.ok) return g.response;
  return save(() => g.store.reset(), "Reset to original data");
}
