// Small, safe wrappers around localStorage. Storage can be unavailable
// (private browsing, blocked cookies, server rendering), so every access is
// wrapped in try/catch and falls back to a default.

/** Bump the version if the stored shape changes, so old data is ignored. */
export const STORAGE_KEYS = {
  app: "us-pizza-demo:app:v1",
  chat: "us-pizza-demo:chat:v1",
} as const;

export function readJSON<T>(key: string): T | undefined {
  try {
    if (typeof window === "undefined") return undefined;
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

export function writeJSON(key: string, value: unknown): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the app keeps working for this session.
  }
}

export function removeKey(key: string): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
