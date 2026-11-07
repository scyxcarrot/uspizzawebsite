import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Content, GenerateContentResponse, Part } from "@google/genai";
import type { AiConfig } from "@/lib/chat/config";
import { finalCards, runChatTurn, type GenAiClient } from "@/lib/chat/engine";
import type { ChatRequest } from "@/lib/chat/request";
import type { ChatEvent } from "@/lib/chat/types";
import { planOrder } from "@/lib/planner";

// A fake Gemini client. Each model call takes the next scripted step:
// a list of chunks to stream, an error to throw at once, or chunks followed by an error.
type Step = { model?: string; parts?: Part[][]; error?: unknown; errorAfterParts?: unknown };

function quotaError() {
  return Object.assign(new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}'), { status: 429 });
}
function serverError() {
  return Object.assign(new Error("Internal error"), { status: 500 });
}

function fakeClient(steps: Step[]) {
  const calls: { model: string; contents: Content[] }[] = [];
  const client = {
    models: {
      generateContentStream: async (params: { model: string; contents: Content[] }) => {
        calls.push({ model: params.model, contents: structuredClone(params.contents) });
        const step = steps.shift();
        if (!step) throw new Error("No scripted step left");
        if (step.error) throw step.error;
        return (async function* () {
          for (const parts of step.parts ?? []) {
            yield { candidates: [{ content: { role: "model", parts } }] } as unknown as GenerateContentResponse;
          }
          if (step.errorAfterParts) throw step.errorAfterParts;
        })();
      },
      generateContent: async () => {
        throw new Error("web search not expected in these tests");
      },
    },
  } as unknown as GenAiClient;
  return { client, calls };
}

const config: AiConfig & { apiKey: string } = {
  apiKey: "test-key",
  chatModel: "main-model",
  searchModel: "search-model",
  fallbackModel: "fallback-model",
  mock: false,
};

const request = (text: string): ChatRequest => ({
  messages: [{ role: "user", text }],
  cart: [],
  orders: [],
  fulfilment: "delivery",
  pendingPlan: [],
});

async function run(steps: Step[], cfg = config, text = "Add two large pepperoni pizzas") {
  const { client, calls } = fakeClient(steps);
  const events: ChatEvent[] = [];
  await runChatTurn({ config: cfg, request: request(text), emit: (e) => events.push(e), client });
  const replyText = events.flatMap((e) => (e.type === "text" ? [e.delta] : [])).join("");
  return { events, calls, replyText, errors: events.filter((e) => e.type === "error") };
}

const addPepperoni: Part = {
  functionCall: { id: "c1", name: "add_to_cart", args: { item: "beef-pepperoni", quantity: 2, size: "large" } },
};

let info: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  info = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("group order plans", () => {
  it("shows the plan card and never adds the same plan twice in one reply", async () => {
    const plan = planOrder({ people: 2, fulfilment: "delivery" });
    const { client } = fakeClient([
      { parts: [[{ functionCall: { id: "a", name: "add_plan_to_cart", args: {} } }, { functionCall: { id: "b", name: "add_plan_to_cart", args: {} } }]] },
      { parts: [[{ text: "Added." }]] },
    ]);
    const events: ChatEvent[] = [];
    await runChatTurn({ config, request: { ...request("yes"), pendingPlan: plan.lines }, emit: (e) => events.push(e), client });
    const carts = events.filter((e) => e.type === "cart");
    expect(carts).toHaveLength(1);
    expect(carts[0]).toMatchObject({ planAdded: true });
  });

  it("sends the plan card with the reply", async () => {
    const { client } = fakeClient([
      { parts: [[{ functionCall: { id: "p", name: "plan_order", args: { people: 4 } } }]] },
      { parts: [[{ text: "Here is a plan." }]] },
    ]);
    const events: ChatEvent[] = [];
    await runChatTurn({ config, request: request("feed 4 people"), emit: (e) => events.push(e), client });
    expect(events.filter((e) => e.type === "card")).toEqual([expect.objectContaining({ card: expect.objectContaining({ kind: "plan", people: 4 }) })]);
    expect(events.filter((e) => e.type === "cart")).toHaveLength(0);
  });
});

describe("whole-reply deadline", () => {
  it("stops a reply that runs past the deadline with the friendly timeout message", async () => {
    const calls: string[] = [];
    // A model that keeps asking for the cart, slowly, forever.
    const client = {
      models: {
        generateContentStream: async (params: { model: string; config: { abortSignal: AbortSignal } }) => {
          calls.push(params.model);
          const abortSignal = params.config.abortSignal;
          return (async function* () {
            await new Promise<void>((resolve, reject) => {
              const t = setTimeout(resolve, 30);
              abortSignal.addEventListener("abort", () => {
                clearTimeout(t);
                reject(abortSignal.reason);
              });
            });
            yield { candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "get_cart", args: {} } }] } }] } as unknown as GenerateContentResponse;
          })();
        },
        generateContent: async () => ({}),
      },
    } as unknown as GenAiClient;
    const events: ChatEvent[] = [];
    await runChatTurn({ config, request: request("hi"), emit: (e) => events.push(e), client, turnTimeoutMs: 80 });
    const errors = events.filter((e) => e.type === "error");
    expect(errors).toEqual([expect.objectContaining({ code: "timeout", retryable: true })]);
    expect(calls.length).toBeLessThan(5);
    expect(events.at(-1)?.type).toBe("error");
  });
});

describe("model fallback", () => {
  it("retries the same call once on the fallback model after a quota error", async () => {
    const { calls, replyText, errors, events } = await run([{ error: quotaError() }, { parts: [[{ text: "Hello!" }]] }]);
    expect(calls.map((c) => c.model)).toEqual(["main-model", "fallback-model"]);
    expect(calls[1].contents).toEqual(calls[0].contents); // the same call, not a new one
    expect(replyText).toBe("Hello!");
    expect(errors).toEqual([]);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("keeps completed cart changes and never runs them twice", async () => {
    const { calls, events, errors, replyText } = await run([
      { parts: [[addPepperoni]] }, // main model: add to cart
      { error: quotaError() }, // main model: rate-limited on the follow-up call
      { parts: [[{ text: "Added 2 Large Beef Pepperoni." }]] }, // fallback finishes the turn
    ]);
    expect(calls.map((c) => c.model)).toEqual(["main-model", "main-model", "fallback-model"]);

    const cartEvents = events.filter((e) => e.type === "cart");
    expect(cartEvents).toHaveLength(1);
    expect(cartEvents[0]).toMatchObject({ cart: [{ itemId: "beef-pepperoni", size: "large", quantity: 2 }] });

    // The fallback sees the tool call and its result from earlier in the turn.
    const sent = calls[2].contents;
    expect(sent).toEqual(calls[1].contents);
    const responses = sent.flatMap((c) => c.parts ?? []).filter((p) => p.functionResponse);
    expect(responses).toHaveLength(1);
    expect(responses[0].functionResponse?.name).toBe("add_to_cart");

    expect(replyText).toBe("Added 2 Large Beef Pepperoni.");
    expect(errors).toEqual([]);
  });

  it("stays on the fallback for the rest of the turn once it has switched", async () => {
    const { calls, events } = await run([
      { error: quotaError() },
      { parts: [[addPepperoni]] },
      { parts: [[{ text: "Done." }]] },
    ]);
    expect(calls.map((c) => c.model)).toEqual(["main-model", "fallback-model", "fallback-model"]);
    expect(events.filter((e) => e.type === "cart")).toHaveLength(1);
  });

  it("does not retry once text has started streaming, and shows the normal retry message", async () => {
    const { calls, replyText, errors } = await run([
      { parts: [[{ text: "Our cheapest pizza is" }]], errorAfterParts: quotaError() },
      { parts: [[{ text: "SHOULD NOT APPEAR" }]] },
    ]);
    expect(calls.map((c) => c.model)).toEqual(["main-model"]);
    expect(replyText).toBe("Our cheapest pizza is");
    expect(errors).toEqual([expect.objectContaining({ code: "rate_limited", retryable: true })]);
  });

  it("shows the existing friendly message when both models are rate-limited", async () => {
    const { calls, errors } = await run([{ error: quotaError() }, { error: quotaError() }, { parts: [[{ text: "x" }]] }]);
    expect(calls.map((c) => c.model)).toEqual(["main-model", "fallback-model"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ code: "rate_limited", message: expect.stringMatching(/try again/) });
  });

  it("does not switch models for other kinds of error", async () => {
    const { calls, errors } = await run([{ error: serverError() }, { parts: [[{ text: "x" }]] }]);
    expect(calls.map((c) => c.model)).toEqual(["main-model"]);
    expect(errors[0]).toMatchObject({ code: "unavailable" });
  });

  it("does nothing extra when no fallback model is set", async () => {
    const { calls, errors } = await run([{ error: quotaError() }], { ...config, fallbackModel: undefined });
    expect(calls.map((c) => c.model)).toEqual(["main-model"]);
    expect(errors[0]).toMatchObject({ code: "rate_limited" });
  });

  it("logs which model answered on the server, but never sends it to the browser", async () => {
    const { events } = await run([{ error: quotaError() }, { parts: [[{ text: "Hi" }]] }]);
    expect(info).toHaveBeenCalledWith("[chat] answered by fallback-model");
    expect(JSON.stringify(events)).not.toMatch(/model/);
  });
});

describe("finalCards", () => {
  const items = { kind: "items" as const, itemIds: ["cola"], more: 0 };
  const order = { kind: "order" as const, orderId: "US-1002" };
  it("keeps the latest card of each kind", () => {
    const later = { ...items, itemIds: ["margherita"] };
    expect(finalCards({ cards: [items, order, later], cartChanged: false })).toEqual([order, later]);
  });
  it("leaves out item lookups when the reply changed the cart", () => {
    expect(finalCards({ cards: [items, order], cartChanged: true })).toEqual([order]);
  });
});
