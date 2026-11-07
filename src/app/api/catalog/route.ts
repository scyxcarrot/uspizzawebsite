// GET /api/catalog: the live menu and outlets. The browser checks this every
// few seconds so admin changes (sold out, prices, closures) show up quickly.

import { catalogVersion } from "@/lib/catalog";
import { loadCatalog } from "@/lib/db/catalog-server";

export async function GET() {
  const { catalog } = await loadCatalog();
  return Response.json({ version: catalogVersion(catalog), catalog }, { headers: { "Cache-Control": "no-store" } });
}
