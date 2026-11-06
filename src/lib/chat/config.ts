// Server-side AI settings, read from environment variables.
// None of these use the NEXT_PUBLIC_ prefix, so they never reach the browser.

/** Defaults chosen from the Gemini docs on 2026-11-06 (see README). */
export const DEFAULT_CHAT_MODEL = "gemini-3.5-flash-lite";
export const DEFAULT_SEARCH_MODEL = "gemini-3.6-flash";

export const LIMITS = {
  maxMessageChars: 1000,
  maxStoredMessageChars: 6000,
  maxMessages: 40,
  /** Only the most recent messages are sent to Gemini. */
  historySentToModel: 12,
  maxToolRounds: 5,
  maxOutputTokens: 2048,
  /** Per Gemini call. */
  requestTimeoutMs: 25_000,
  /** Whole reply, including every model call and tool. Keep below maxDuration in app/api/chat/route.ts. */
  turnTimeoutMs: 120_000,
  searchTimeoutMs: 20_000,
  /** Per IP. Override with CHAT_RATE_LIMIT_PER_MINUTE (the browser tests raise it). */
  rateLimit: { requests: Number(process.env.CHAT_RATE_LIMIT_PER_MINUTE) || 12, windowMs: 60_000 },
} as const;

export type AiConfig = {
  apiKey: string | undefined;
  chatModel: string;
  searchModel: string;
  /** Used only when chatModel hits a rate-limit or quota error. Unset = no fallback. */
  fallbackModel: string | undefined;
  mock: boolean;
};

/**
 * Mock mode is for browser tests only. It is refused when VERCEL_ENV is
 * "production", even if AI_MOCK=true is set by mistake.
 */
export function isMockAllowed(env: Record<string, string | undefined> = process.env): boolean {
  return env.AI_MOCK === "true" && env.VERCEL_ENV !== "production";
}

export function getAiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  return {
    apiKey: env.GEMINI_API_KEY?.trim() || undefined,
    chatModel: env.GEMINI_MODEL?.trim() || DEFAULT_CHAT_MODEL,
    searchModel: env.GEMINI_SEARCH_MODEL?.trim() || DEFAULT_SEARCH_MODEL,
    fallbackModel: env.GEMINI_FALLBACK_MODEL?.trim() || undefined,
    mock: isMockAllowed(env),
  };
}
