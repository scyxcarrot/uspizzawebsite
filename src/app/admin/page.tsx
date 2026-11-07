// /admin: edit the menu (prices, descriptions, sold out) and outlets (hours,
// temporary closures). Signed-in check happens here on the server; every
// change is checked again by the /api/admin/* routes.

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminPanel } from "@/components/admin/AdminPanel";
import { ADMIN_COOKIE, adminConfigured, verifySessionToken } from "@/lib/admin/auth";
import { invalidateCatalog, loadCatalog } from "@/lib/db/catalog-server";
import { getStore, type AuditEntry } from "@/lib/db/store";

export const metadata: Metadata = {
  title: "Admin – US Pizza Demo",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminPage() {
  await connection();
  const shell = (body: React.ReactNode) => <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">{body}</div>;

  if (!adminConfigured()) {
    return shell(
      <div className="rounded-card border border-line bg-white p-6 shadow-card">
        <h1 className="text-2xl font-extrabold">Admin</h1>
        <p className="mt-2 text-ink-soft">The admin page is not set up yet: the ADMIN_PASSWORD environment variable is missing.</p>
      </div>,
    );
  }

  const signedIn = verifySessionToken((await cookies()).get(ADMIN_COOKIE)?.value);
  if (!signedIn) return shell(<AdminLogin />);

  invalidateCatalog();
  const { catalog, source } = await loadCatalog();
  const store = getStore();
  const canSave = !!store && source !== "original";
  let audit: AuditEntry[] = [];
  if (canSave) {
    try {
      audit = await store.audit(25);
    } catch {
      audit = [];
    }
  }
  return shell(<AdminPanel catalog={catalog} audit={audit} source={source} canSave={canSave} />);
}
