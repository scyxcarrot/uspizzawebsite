"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Sign-in failed. Please try again.");
        return;
      }
      setPassword("");
      router.refresh();
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-sm rounded-card border border-line bg-white p-6 shadow-card" data-testid="admin-login">
      <h1 className="text-2xl font-extrabold">Admin sign-in</h1>
      <p className="mt-1 text-sm text-ink-soft">Manage menu prices, sold-out items and outlet hours.</p>
      <label htmlFor="admin-password" className="mt-5 block font-semibold">
        Password
      </label>
      <input
        id="admin-password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mt-1 min-h-12 w-full rounded-xl border-2 border-line px-3 focus:border-ink"
        aria-invalid={!!error}
        aria-describedby={error ? "admin-login-error" : undefined}
        required
      />
      {error && (
        <p id="admin-login-error" role="alert" className="mt-3 rounded-xl bg-brand-tint px-3 py-2 text-sm font-medium text-brand-dark" data-testid="admin-login-error">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !password}
        className="mt-5 flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-5 font-bold text-white hover:bg-brand-dark disabled:opacity-60"
        data-testid="admin-login-submit"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
