"use client";

// Makes the server's live catalogue (menu and outlets from the database) the
// one the browser uses, then checks /api/catalog every few seconds so admin
// changes such as "sold out" appear without a reload. Components re-render
// through useCatalogVersion (AppStateProvider uses it, so every consumer of
// useAppState updates too).

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { applyCatalog, type Catalog } from "@/lib/catalog";

export const CATALOG_POLL_MS = 5000;

const VersionContext = createContext("initial");

export function useCatalogVersion(): string {
  return useContext(VersionContext);
}

export function CatalogProvider({ initial, version, children }: { initial: Catalog; version: string; children: ReactNode }) {
  // Apply during the first render, so the server HTML and the first browser
  // render use the same data (no hydration mismatch).
  const [current, setCurrent] = useState(() => {
    applyCatalog(initial);
    return version;
  });

  // A server refresh (e.g. after an admin change) passes a newer catalogue.
  const [seenProp, setSeenProp] = useState(version);
  if (version !== seenProp) {
    setSeenProp(version);
    if (applyCatalog(initial)) setCurrent(version);
  }

  useEffect(() => {
    let stopped = false;
    let latest = current;
    async function check() {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/catalog", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { version?: string; catalog?: unknown };
        if (stopped || !data.version || data.version === latest) return;
        if (applyCatalog(data.catalog)) {
          latest = data.version;
          setCurrent(data.version);
        }
      } catch {
        // Offline or the server is busy: keep the current data and try again later.
      }
    }
    const timer = setInterval(check, CATALOG_POLL_MS);
    const onVisible = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <VersionContext.Provider value={current}>{children}</VersionContext.Provider>;
}
