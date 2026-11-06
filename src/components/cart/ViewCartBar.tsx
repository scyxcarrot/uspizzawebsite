"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { formatRM } from "@/lib/money";
import { useAppState } from "@/components/AppStateProvider";

const BAR_HEIGHT = "76px";

/**
 * Phone-only bar fixed to the bottom of the screen when the cart has items.
 * It sets --bottom-bar-h so the page and the chat button can make room for it.
 */
export function ViewCartBar() {
  const { ready, summary, setCartOpen, cartOpen } = useAppState();
  const pathname = usePathname();
  const visible = ready && summary.itemCount > 0 && pathname !== "/checkout" && !cartOpen;

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("has-cart-bar", visible);
    root.style.setProperty("--bottom-bar-h", visible ? BAR_HEIGHT : "0px");
  }, [visible]);

  if (!visible) return null;

  return (
    <div
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
