import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_FAILED_ATTEMPTS,
  checkPassword,
  clearFailedLogins,
  createSessionToken,
  loginBlocked,
  recordFailedLogin,
  resetLoginLimitsForTests,
  sameOrigin,
  sessionCookie,
  verifySessionToken,
} from "@/lib/admin/auth";
import { handleItemChange } from "@/lib/admin/changes";
import { applyCatalog, originalCatalog } from "@/lib/catalog";
import { invalidateCatalog } from "@/lib/db/catalog-server";
import { createMemoryStore, setStoreForTests } from "@/lib/db/store";

const PASSWORD = "test-password-123";

beforeEach(() => {
  process.env.ADMIN_PASSWORD = PASSWORD;
  resetLoginLimitsForTests();
});
afterEach(() => {
  delete process.env.ADMIN_PASSWORD;
  setStoreForTests(undefined);
  invalidateCatalog();
  applyCatalog(originalCatalog());
});

describe("admin password and session", () => {
  it("checks the password on the server", () => {
    expect(checkPassword(PASSWORD)).toBe(true);
    expect(checkPassword("wrong")).toBe(false);
    expect(checkPassword(undefined)).toBe(false);
    delete process.env.ADMIN_PASSWORD;
    expect(checkPassword("")).toBe(false);
  });

  it("signs sessions, rejects tampered or expired ones, and a new password signs everyone out", () => {
    const now = Date.now();
    const token = createSessionToken(now);
    expect(verifySessionToken(token, now)).toBe(true);
    const [exp, sig] = token.split(".");
    expect(verifySessionToken(`${Number(exp) + 3600}.${sig}`, now)).toBe(false);
    expect(verifySessionToken(`${exp}.${sig}x`, now)).toBe(false);
    expect(verifySessionToken(token, now + 9 * 3600_000)).toBe(false);
    expect(verifySessionToken(undefined, now)).toBe(false);
    process.env.ADMIN_PASSWORD = "another-password";
    expect(verifySessionToken(token, now)).toBe(false);
  });

  it("uses an httpOnly, SameSite=Strict cookie with no password in it", () => {
    const token = createSessionToken();
    const cookie = sessionCookie(token);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "strict", path: "/" });
    expect(cookie.value).not.toContain(PASSWORD);
  });

  it("rate-limits failed sign-ins per IP", () => {
    const now = Date.now();
    for (let i = 0; i < MAX_FAILED_ATTEMPTS - 1; i++) recordFailedLogin("1.2.3.4", now);
    expect(loginBlocked("1.2.3.4", now)).toBe(0);
    recordFailedLogin("1.2.3.4", now);
    expect(loginBlocked("1.2.3.4", now)).toBeGreaterThan(0);
    expect(loginBlocked("5.6.7.8", now)).toBe(0);
    expect(loginBlocked("1.2.3.4", now + 16 * 60_000)).toBe(0);
    recordFailedLogin("9.9.9.9", now);
    clearFailedLogins("9.9.9.9");
    expect(loginBlocked("9.9.9.9", now)).toBe(0);
  });

  it("rejects cross-site requests", () => {
    const req = (origin?: string) =>
      new Request("http://shop.test/api/admin/item", { method: "POST", headers: { host: "shop.test", ...(origin ? { origin } : {}) } });
    expect(sameOrigin(req("http://shop.test"))).toBe(true);
    expect(sameOrigin(req("https://evil.test"))).toBe(false);
    expect(sameOrigin(req())).toBe(false);
  });
});

describe("admin item route", () => {
  const post = (body: unknown, signedIn = true) =>
    new Request("http://shop.test/api/admin/item", {
      method: "POST",
      headers: {
        host: "shop.test",
        origin: "http://shop.test",
        "content-type": "application/json",
        ...(signedIn ? { cookie: `admin_session=${createSessionToken()}` } : {}),
      },
      body: JSON.stringify(body),
    });

  it("needs a session", async () => {
    setStoreForTests(createMemoryStore());
    expect((await handleItemChange(post({ id: "garlic-bread", soldOut: true }, false))).status).toBe(401);
  });

  it("validates, saves with an audit entry, and refuses when no database is connected", async () => {
    const store = createMemoryStore();
    setStoreForTests(store);
    const bad = await handleItemChange(post({ id: "garlic-bread", priceRM: -1 }));
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toMatch(/at least RM 0.50/);
    expect((await handleItemChange(post({ id: "nope", soldOut: true }))).status).toBe(404);

    const ok = await handleItemChange(post({ id: "garlic-bread", soldOut: true }));
    expect(ok.status).toBe(200);
    expect((await store.load()).menu.find((m) => m.id === "garlic-bread")?.soldOut).toBe(true);
    expect((await store.audit())[0]?.summary).toBe("Garlic Bread: marked sold out");

    setStoreForTests(null);
    expect((await handleItemChange(post({ id: "garlic-bread", soldOut: false }))).status).toBe(503);
  });
});
