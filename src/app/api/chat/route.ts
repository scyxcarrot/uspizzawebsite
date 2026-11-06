// POST /api/chat
// Receives the conversation, cart, and browser orders; streams the reply
// back as newline-delimited JSON events (see ChatEvent in lib/chat/types).
// All Gemini calls happen here on the server; the API key never reaches the browser.

import { getAiConfig, LIMITS } from "@/lib/chat/config";
import { geminiDailyCap } from "@/lib/chat/dailyCap";
import { runChatTurn, type Emit } from "@/lib/chat/engine";
import { FRIENDLY, type FriendlyError } from "@/lib/chat/errors";
import { runMockTurn } from "@/lib/chat/mock";
import { createRateLimiter, clientIp } from "@/lib/chat/rateLimit";
import { parseChatRequest } from "@/lib/chat/request";
import type { ChatEvent } from "@/lib/chat/types";

// Seconds. Streaming time counts too. A reply can make up to 6 Gemini calls
// (5 tool rounds plus one fallback retry) of up to 25 s each, plus web
// searches, so the engine stops every reply at 120 s (LIMITS.turnTimeoutMs).
// 150 s leaves room to send the closing message, and is within the Vercel
// Hobby limit of 300 s (Fluid compute, the default for new projects).
export const maxDuration = 150;

const rateLimit = createRateLimiter(LIMITS.rateLimit.requests, LIMITS.rateLimit.windowMs);

function errorResponse(error: FriendlyError, status: number, headers: Record<string, string> = {}) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

export async function POST(req: Request) {
  const limit = rateLimit(clientIp(req.headers));
  if (!limit.allowed) {
    return errorResponse(FRIENDLY.rate_limited, 429, { "Retry-After": String(limit.retryAfterSeconds) });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(FRIENDLY.bad_request, 400);
  }
  const parsed = parseChatRequest(body);
  if (!parsed.ok) {
    return errorResponse({ ...FRIENDLY.bad_request, message: parsed.error }, 400);
  }

  const config = getAiConfig();
  if (!config.mock && !config.apiKey) {
    return errorResponse(FRIENDLY.missing_key, 503);
  }
  // Don't start a turn if today's Gemini allowance is already used up.
  if (!config.mock && geminiDailyCap.remaining() === 0) {
    return errorResponse(FRIENDLY.daily_cap, 429);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit: Emit = (event: ChatEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          closed = true; // the browser went away
        }
      };
      try {
        if (config.mock) {
          await runMockTurn(parsed.data, emit);
        } else {
          await runChatTurn({ config: { ...config, apiKey: config.apiKey! }, request: parsed.data, emit, signal: req.signal });
        }
      } catch (err) {
        console.error("[chat] unexpected error:", err);
        const f = FRIENDLY.unknown;
        emit({ type: "error", code: f.code, message: f.message, retryable: f.retryable });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
