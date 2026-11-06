import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Content, GenerateContentResponse, Part } from "@google/genai";
import type { AiConfig } from "@/lib/chat/config";
import { runChatTurn, type GenAiClient } from "@/lib/chat/engine";
import type { ChatRequest } from "@/lib/chat/request";
import type { ChatEvent } from "@/lib/chat/types";

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
