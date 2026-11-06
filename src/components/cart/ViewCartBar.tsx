"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { formatRM } from "@/lib/money";
import { useAppState } from "@/components/AppStateProvider";

/**
 * Phone-only bar fixed to the bottom of the screen when the cart has items.
 * It publishes its real height as --bottom-bar-h so the page and the chat
 * button can make room for it and never cover it.
 */
export function ViewCartBar() {
  const { ready, summary, setCartOpen, cartOpen } = useAppState();
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);
  const visible = ready && summary.itemCount > 0 && pathname !== "/checkout" && !cartOpen;

  useEffect(() => {
    const root = document.documentElement;
    const el = ref.current;
    const setHeight = () => {
      // offsetHeight is 0 when the bar is hidden by CSS (tablet and desktop).
      root.style.setProperty("--bottom-bar-h", `${el?.offsetHeight ?? 0}px`);
    };
    setHeight();
    if (!el) return;
    const observer = new ResizeObserver(setHeight);
    observer.observe(el);
    window.addEventListener("resize", setHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", setHeight);
      root.style.setProperty("--bottom-bar-h", "0px");
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      ref={ref}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"
      data-testid="view-cart-bar"
    >
      <button
        type="button"
        onClick={() => setCartOpen(true)}
        className="flex min-h-12 w-full items-center justify-between rounded-full bg-brand pl-2 pr-5 font-bold text-white hover:bg-brand-dark"
      >
        <span className="flex items-center gap-3">
          <span className="grid size-8 place-items-center rounded-full bg-white text-sm text-brand tabular-nums">
            {summary.itemCount}
          </span>
          View cart
        </span>
        <span className="tabular-nums">{formatRM(summary.totalSen)}</span>
      </button>
    </div>
  );
}
