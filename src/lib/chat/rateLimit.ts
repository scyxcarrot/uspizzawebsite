// A simple in-memory, per-IP rate limit (fixed window).
// Best-effort only: on serverless hosting each instance has its own memory,
// so limits are not shared between instances or kept across cold starts.

type Bucket = { count: number; resetAt: number };

export function createRateLimiter(limit: number, windowMs: number) {
  const buckets = new Map<string, Bucket>();

  return function check(key: string, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
    // Occasionally drop expired buckets so memory does not grow forever.
    if (buckets.size > 5000) {
      for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
    }
    const bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (bucket.count >= limit) {
      return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
    }
    bucket.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  };
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}
