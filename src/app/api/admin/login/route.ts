// POST /api/admin/login { password }. Sets the signed admin cookie.

import { cookies } from "next/headers";
import { z } from "zod";
import {
  adminConfigured,
  checkPassword,
  clearFailedLogins,
  clientIp,
  createSessionToken,
  loginBlocked,
  recordFailedLogin,
  sameOrigin,
  sessionCookie,
} from "@/lib/admin/auth";

const bodySchema = z.object({ password: z.string().max(200) }).strict();
const noStore = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Bad request." }, { status: 403, headers: noStore });
  if (!adminConfigured()) {
    return Response.json({ error: "The admin page is not set up: ADMIN_PASSWORD is missing." }, { status: 503, headers: noStore });
  }
  const ip = clientIp(req);
  const wait = loginBlocked(ip);
  if (wait > 0) {
    return Response.json(
      { error: `Too many failed attempts. Try again in ${Math.ceil(wait / 60)} minutes.` },
      { status: 429, headers: { ...noStore, "Retry-After": String(wait) } },
    );
  }
  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success || !checkPassword(body.data.password)) {
    recordFailedLogin(ip);
    return Response.json({ error: "That password is not correct." }, { status: 401, headers: noStore });
  }
  clearFailedLogins(ip);
  (await cookies()).set(sessionCookie(createSessionToken()));
  return Response.json({ ok: true }, { headers: noStore });
}
