// Turn any failure into a friendly, safe message. Raw provider errors and
// stack traces are logged on the server but never sent to the browser.

import type { ChatErrorCode } from "@/lib/chat/types";

export type FriendlyError = { code: ChatErrorCode; message: string; retryable: boolean };

export const FRIENDLY: Record<ChatErrorCode, FriendlyError> = {
  bad_request: { code: "bad_request", message: "Sorry, I couldn't read that message. Please try again.", retryable: false },
  missing_key: {
    code: "missing_key",
    message: "The AI assistant isn't set up on this site right now. You can still browse the menu, order, and track orders as normal.",
    retryable: false,
  },
  invalid_key: {
    code: "invalid_key",
    message: "The AI assistant isn't available right now because of a configuration problem. Ordering still works as normal.",
    retryable: false,
  },
  rate_limited: {
    code: "rate_limited",
    message: "The assistant is getting a lot of questions right now. Please wait a moment and try again.",
    retryable: true,
  },
  timeout: { code: "timeout", message: "The assistant took too long to reply. Please try again.", retryable: true },
  network: {
    code: "network",
    message: "I couldn't reach the assistant. Please check your connection and try again.",
    retryable: true,
  },
  unavailable: {
    code: "unavailable",
    message: "The AI service is having trouble right now. Please try again in a moment. Ordering still works as normal.",
    retryable: true,
  },
  too_many_steps: {
    code: "too_many_steps",
    message: "Sorry, that request needed too many steps. Could you ask in a simpler way?",
    retryable: false,
  },
  daily_cap: {
    code: "daily_cap",
    message:
      "The assistant has answered as many questions as it can today. It will be back tomorrow. You can still browse the menu, order, and track orders as normal.",
    retryable: false,
  },
  unknown: { code: "unknown", message: "Sorry, something went wrong. Please try again.", retryable: true },
};

/** Map an error thrown while calling Gemini to a friendly error. */
export function classifyError(err: unknown): FriendlyError {
  if (err && typeof err === "object") {
    const e = err as { name?: string; status?: number; message?: string };
    if (e.name === "AbortError" || e.name === "TimeoutError") return FRIENDLY.timeout;
    const status = typeof e.status === "number" ? e.status : undefined;
    const msg = (e.message ?? "").toLowerCase();
    if (status === 429 || msg.includes("resource_exhausted") || msg.includes("quota")) return FRIENDLY.rate_limited;
    if (status === 401 || status === 403 || msg.includes("api key not valid") || msg.includes("api_key_invalid")) {
      return FRIENDLY.invalid_key;
    }
    if (status === 400 && msg.includes("api key")) return FRIENDLY.invalid_key;
    if (status !== undefined && status >= 500) return FRIENDLY.unavailable;
    if (e.name === "TypeError" && msg.includes("fetch")) return FRIENDLY.network;
    if (msg.includes("econnreset") || msg.includes("enotfound") || msg.includes("network")) return FRIENDLY.network;
  }
  return FRIENDLY.unknown;
}
