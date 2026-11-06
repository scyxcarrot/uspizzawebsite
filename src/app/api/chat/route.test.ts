import { afterEach, describe, expect, it, vi } from "vitest";

const body = (b: unknown) =>
  new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `10.0.0.${Math.floor(Math.random() * 250)}` },
    body: typeof b === "string" ? b : JSON.stringify(b),
  });

async function loadRoute(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  return import("@/app/api/chat/route");
}

async function readEvents(res: Response) {
  const text = await res.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { type: string; [k: string]: unknown });
}

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/chat", () => {
  it("returns a friendly 503 when the API key is missing", async () => {
    const { POST } = await loadRoute({ GEMINI_API_KEY: "", AI_MOCK: "false" });
    const res = await POST(body({ messages: [{ role: "user", text: "hi" }] }));
    expect(res.status).toBe(503);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe("missing_key");
    expect(json.error.message).toMatch(/still browse the menu/);
  });

  it("rejects malformed JSON and invalid messages with 400", async () => {
    const { POST } = await loadRoute({ AI_MOCK: "true" });
    expect((await POST(body("{not json"))).status).toBe(400);
    expect((await POST(body({ messages: [] }))).status).toBe(400);
    const long = await POST(body({ messages: [{ role: "user", text: "x".repeat(5000) }] }));
    expect(long.status).toBe(400);
  });

  it("refuses mock mode in production", async () => {
    const { POST } = await loadRoute({ AI_MOCK: "true", VERCEL_ENV: "production", GEMINI_API_KEY: "" });
    const res = await POST(body({ messages: [{ role: "user", text: "Add a cola" }] }));
    // Not mocked: with no key it reports the missing key instead.
    expect(res.status).toBe(503);
  });

  it("streams mock events, with a server-validated cart", async () => {
    const { POST } = await loadRoute({ AI_MOCK: "true", VERCEL_ENV: "preview" });
    const res = await POST(body({ messages: [{ role: "user", text: "Add two large pepperoni pizzas" }], cart: [] }));
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    const events = await readEvents(res);
    const cart = events.find((e) => e.type === "cart");
    expect(cart?.cart).toEqual([
      { lineId: "beef-pepperoni:large:hand-tossed", itemId: "beef-pepperoni", size: "large", crust: "hand-tossed", quantity: 2 },
    ]);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("rate-limits one IP", async () => {
    const { POST } = await loadRoute({ AI_MOCK: "true", CHAT_RATE_LIMIT_PER_MINUTE: "2" });
    const req = () =>
      new Request("http://localhost/api/chat", {
        method: "POST",
        headers: { "x-forwarded-for": "9.9.9.9" },
        body: JSON.stringify({ messages: [{ role: "user", text: "hi" }] }),
      });
    expect((await POST(req())).status).toBe(200);
    expect((await POST(req())).status).toBe(200);
    const limited = await POST(req());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });
});
