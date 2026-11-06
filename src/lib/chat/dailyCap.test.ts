import { describe, expect, it } from "vitest";
import { createDailyCap, dailyCapFromEnv, DEFAULT_DAILY_CAP } from "@/lib/chat/dailyCap";

describe("daily Gemini request cap", () => {
  it("allows requests up to the cap, then refuses", () => {
    const cap = createDailyCap(3);
    const now = new Date("2026-11-06T12:00:00Z");
    expect([cap.tryConsume(now), cap.tryConsume(now), cap.tryConsume(now)]).toEqual([true, true, true]);
    expect(cap.tryConsume(now)).toBe(false);
    expect(cap.remaining(now)).toBe(0);
  });

  it("resets at midnight US Pacific time, when Google resets the free quota", () => {
    const cap = createDailyCap(1);
    // 07:59 UTC on 7 Nov is still 6 Nov in Los Angeles (UTC-8).
    expect(cap.tryConsume(new Date("2026-11-07T07:59:00Z"))).toBe(true);
    expect(cap.tryConsume(new Date("2026-11-07T07:59:30Z"))).toBe(false);
    // 08:00 UTC is midnight Pacific: a new day.
    expect(cap.tryConsume(new Date("2026-11-07T08:00:00Z"))).toBe(true);
  });

  it("reads the cap from GEMINI_DAILY_REQUEST_CAP with a sensible default", () => {
    expect(dailyCapFromEnv({})).toBe(DEFAULT_DAILY_CAP);
    expect(DEFAULT_DAILY_CAP).toBe(300);
    expect(dailyCapFromEnv({ GEMINI_DAILY_REQUEST_CAP: "50" })).toBe(50);
    expect(dailyCapFromEnv({ GEMINI_DAILY_REQUEST_CAP: "abc" })).toBe(DEFAULT_DAILY_CAP);
    expect(dailyCapFromEnv({ GEMINI_DAILY_REQUEST_CAP: "-1" })).toBe(DEFAULT_DAILY_CAP);
  });
});
