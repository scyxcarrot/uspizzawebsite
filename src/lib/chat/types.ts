// Types shared by the /api/chat route and the browser chat widget.

import type { CartLine } from "@/lib/cart";

export type Source = { title: string; url: string };

/** One line of the newline-delimited JSON stream sent by /api/chat. */
export type ChatEvent =
  | { type: "status"; text: string }
  | { type: "text"; delta: string }
  | { type: "cart"; cart: CartLine[]; message: string }
  | { type: "sources"; sources: Source[] }
  | { type: "error"; code: ChatErrorCode; message: string; retryable: boolean }
  | { type: "done" };

export type ChatErrorCode =
  | "bad_request"
  | "missing_key"
  | "invalid_key"
  | "rate_limited"
  | "timeout"
  | "network"
  | "unavailable"
  | "too_many_steps"
  | "unknown";

export type ChatRole = "user" | "assistant";

/** A message as stored in the browser and sent to the server. */
export type ChatMessage = {
  id: string;
  role: ChatRole;
  text: string;
  sources?: Source[];
  /** Cart confirmations shown under an assistant reply, e.g. "Added to cart: 1 × Cola". */
  cartNotes?: string[];
  error?: { message: string; retryable: boolean };
};
