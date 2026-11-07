// Admin sign-in. Server only.
//
// - One password, from the ADMIN_PASSWORD environment variable. It is only
//   ever compared on the server and never sent to the browser.
// - A successful sign-in sets an httpOnly, SameSite=Strict cookie holding an
//   expiry time and an HMAC signature of it. Changing ADMIN_PASSWORD signs
//   everyone out.
// - Failed attempts are rate-limited per IP address.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "admin_session";
export const SESSION_SECONDS = 8 * 60 * 60;
export const MAX_FAILED_ATTEMPTS = 5;
export const FAILED_WINDOW_MS = 15 * 60 * 1000;

function password(): string | null {
  const p = process.env.ADMIN_PASSWORD;
  return p && p.length >= 8 ? p : null;
}

export function adminConfigured(): boolean {
  return password() !== null;
}

const sha = (s: string) => createHash("sha256").update(s).digest();

export function checkPassword(input: unknown): boolean {
  const p = password();
  if (!p || typeof input !== "string" || input.length > 200) return false;
  return timingSafeEqual(sha(input), sha(p));
}

function sign(payload: string, p: string): string {
  return createHmac("sha256", sha(`us-pizza-admin-session:${p}`)).update(payload).digest("base64url");
}

export function createSessionToken(now: number = Date.now()): string {
  const p = password();
  if (!p) throw new Error("ADMIN_PASSWORD is not set");
  const exp = String(Math.floor(now / 1000) + SESSION_SECONDS);
  return `${exp}.${sign(exp, p)}`;
}

export function verifySessionToken(token: string | undefined | null, now: number = Date.now()): boolean {
  const p = password();
  if (!p || !token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !/^\d{1,12}$/.test(exp)) return false;
  if (Number(exp) * 1000 <= now) return false;
  const expected = Buffer.from(sign(exp, p));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function sessionCookie(token: string) {
  return {
    name: ADMIN_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.ADMIN_INSECURE_COOKIE !== "true",
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_SECONDS,
  };
}

// ---------- Rate limiting of failed sign-ins (per server instance) ----------

const failures = new Map<string, { count: number; resetAt: number }>();

export function loginBlocked(ip: string, now: number = Date.now()): number {
  const f = failures.get(ip);
  if (!f || f.resetAt <= now) return 0;
  return f.count >= MAX_FAILED_ATTEMPTS ? Math.ceil((f.resetAt - now) / 1000) : 0;
}

export function recordFailedLogin(ip: string, now: number = Date.now()) {
  const f = failures.get(ip);
  if (!f || f.resetAt <= now) failures.set(ip, { count: 1, resetAt: now + FAILED_WINDOW_MS });
  else f.count += 1;
  if (failures.size > 5000) failures.clear();
}

export function clearFailedLogins(ip: string) {
  failures.delete(ip);
}

export function resetLoginLimitsForTests() {
  failures.clear();
}

// ---------- Request helpers ----------

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** Reject cross-site form posts: the Origin header must match the host. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === (req.headers.get("x-forwarded-host") ?? req.headers.get("host"));
  } catch {
    return false;
  }
}

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return undefined;
}

export function isAdminRequest(req: Request): boolean {
  return verifySessionToken(readCookie(req, ADMIN_COOKIE));
}
