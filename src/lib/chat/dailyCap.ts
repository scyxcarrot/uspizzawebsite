// A daily cap on Gemini requests, so testing and reviewers cannot use up the
// whole free-tier quota. Every model call counts (a chat turn with tools uses
// 2-4 calls, and web search is one more).
//
// The day resets at midnight US Pacific time, the same moment Google resets
// its free-tier daily quota.
//
// Best-effort only: the count lives in server memory, so on serverless
// hosting each instance keeps its own count and a cold start resets it.

export const DEFAULT_DAILY_CAP = 300;

function pacificDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function createDailyCap(limit: number) {
  let day = "";
  let used = 0;

  const roll = (now: Date) => {
    const today = pacificDay(now);
    if (today !== day) {
      day = today;
      used = 0;
    }
  };

  return {
    /** Use one request from today's allowance. Returns false when the cap is reached. */
    tryConsume(now = new Date()): boolean {
      roll(now);
      if (used >= limit) return false;
      used += 1;
      return true;
    },
    remaining(now = new Date()): number {
      roll(now);
      return Math.max(0, limit - used);
    },
  };
}

export type DailyCap = ReturnType<typeof createDailyCap>;

export function dailyCapFromEnv(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.GEMINI_DAILY_REQUEST_CAP);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_DAILY_CAP;
}

/** One shared counter per server instance. */
export const geminiDailyCap: DailyCap = createDailyCap(dailyCapFromEnv());
