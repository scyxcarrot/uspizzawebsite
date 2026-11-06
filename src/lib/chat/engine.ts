// The chat "engine": sends the conversation to Gemini, runs any tools Gemini
// asks for, sends the results back, and streams the reply to the browser.
// Server only. Called from /api/chat.

import { GoogleGenAI, type Content, type FunctionCall, type Part } from "@google/genai";
import { LIMITS, type AiConfig } from "@/lib/chat/config";
import { classifyError, FRIENDLY } from "@/lib/chat/errors";
import type { ChatRequest } from "@/lib/chat/request";
import { buildSystemPrompt } from "@/lib/chat/systemPrompt";
import { TOOL_DECLARATIONS, TOOL_STATUS, isToolName, runTool, type ToolContext, type WebSearchResult } from "@/lib/chat/tools";
import type { ChatEvent, Source } from "@/lib/chat/types";

export type Emit = (event: ChatEvent) => void;

/** Run fn with an abort signal that fires after `ms` or when `parent` aborts. */
async function withTimeout<T>(ms: number, parent: AbortSignal | undefined, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), ms);
  const onParentAbort = () => controller.abort(parent?.reason);
  parent?.addEventListener("abort", onParentAbort);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener("abort", onParentAbort);
  }
}

export async function runChatTurn(args: {
  config: AiConfig & { apiKey: string };
  request: ChatRequest;
  emit: Emit;
  signal?: AbortSignal;
  now?: Date;
}): Promise<void> {
  const { config, request, emit, signal } = args;
  const now = args.now ?? new Date();
  const ai = new GoogleGenAI({ apiKey: config.apiKey });

  const contents: Content[] = request.messages.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.text }],
  }));

  const ctx: ToolContext = {
    cart: request.cart,
    fulfilment: request.fulfilment,
    browserOrders: request.orders,
    now,
    webSearch: (query) => webSearch(ai, config.searchModel, query, signal),
  };
  const sources: Source[] = [];

  try {
    for (let round = 0; round < LIMITS.maxToolRounds; round++) {
      const { parts, calls, wroteText } = await withTimeout(LIMITS.requestTimeoutMs, signal, async (abortSignal) => {
        const stream = await ai.models.generateContentStream({
          model: config.chatModel,
          contents,
          config: {
            systemInstruction: buildSystemPrompt(now),
            tools: [{ functionDeclarations: TOOL_DECLARATIONS.map((t) => ({ ...t })) }],
            maxOutputTokens: LIMITS.maxOutputTokens,
            abortSignal,
          },
        });
        const parts: Part[] = [];
        const calls: FunctionCall[] = [];
        let wroteText = false;
        for await (const chunk of stream) {
          for (const part of chunk.candidates?.[0]?.content?.parts ?? []) {
            // Keep every part (including thought signatures) so the next
            // round can send the model's turn back exactly as it was.
            parts.push(part);
            if (part.thought) continue;
            if (part.text) {
              emit({ type: "text", delta: part.text });
              wroteText = true;
            }
            if (part.functionCall) calls.push(part.functionCall);
          }
        }
        return { parts, calls, wroteText };
      });

      if (calls.length === 0) {
        if (!wroteText) {
          emit({ type: "text", delta: "Sorry, I couldn't come up with an answer to that. Could you rephrase it?" });
        }
        if (sources.length) emit({ type: "sources", sources: dedupeSources(sources) });
        emit({ type: "done" });
        return;
      }

      contents.push({ role: "model", parts });
      const responses: Part[] = [];
      for (const call of calls) {
        const name = call.name ?? "";
        emit({ type: "status", text: isToolName(name) ? TOOL_STATUS[name] : "Working on it…", tool: name });
        const outcome = await runTool(name, call.args, ctx);
        if (outcome.cart) {
          ctx.cart = outcome.cart; // later tools in this turn see the new cart
          emit({ type: "cart", cart: outcome.cart, message: outcome.cartMessage ?? "Cart updated" });
        }
        if (outcome.sources) sources.push(...outcome.sources);
        responses.push({ functionResponse: { id: call.id, name, response: outcome.result } });
      }
      contents.push({ role: "user", parts: responses });
    }

    const f = FRIENDLY.too_many_steps;
    emit({ type: "error", code: f.code, message: f.message, retryable: f.retryable });
  } catch (err) {
    console.error("[chat] Gemini request failed:", err);
    const f = classifyError(err);
    emit({ type: "error", code: f.code, message: f.message, retryable: f.retryable });
  }
}

/**
 * web_search runs as its own Gemini request with Google Search grounding,
 * separate from the main chat, so it does not clash with function calling.
 */
export async function webSearch(
  ai: GoogleGenAI,
  model: string,
  query: string,
  parent?: AbortSignal,
): Promise<WebSearchResult> {
  try {
    return await withTimeout(LIMITS.searchTimeoutMs, parent, async (abortSignal) => {
      const response = await ai.models.generateContent({
        model,
        contents: `Search the web and answer briefly (at most 5 sentences) with current facts. Today in Malaysia: ${new Date().toISOString()}.\n\nQuestion: ${query}`,
        config: { tools: [{ googleSearch: {} }], maxOutputTokens: 1024, abortSignal },
      });
      const answer = response.text?.trim();
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const sources = dedupeSources(
        chunks
          .map((c) => ({ title: c.web?.title ?? c.web?.domain ?? "Source", url: c.web?.uri ?? "" }))
          .filter((s) => s.url.startsWith("https://")),
      ).slice(0, 5);
      if (!answer) return { ok: false, error: "Live information could not be checked." };
      return { ok: true, answer, sources };
    });
  } catch (err) {
    console.error("[chat] web_search failed:", err);
    return { ok: false, error: "Live information could not be checked right now." };
  }
}

function dedupeSources(list: Source[]): Source[] {
  const seen = new Set<string>();
  return list.filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)));
}
