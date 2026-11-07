// POST /api/admin/logout. Clears the admin cookie.

import { cookies } from "next/headers";
import { ADMIN_COOKIE, sameOrigin } from "@/lib/admin/auth";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Bad request." }, { status: 403 });
  (await cookies()).delete(ADMIN_COOKIE);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
