"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { formatRM } from "@/lib/money";
import { useAppState } from "@/components/AppStateProvider";
import { CartIcon, CloseIcon } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import { CartLines, CartTotals, FulfilmentToggle } from "@/components/cart/CartParts";

/** Side panel on desktop and tablet, full screen on phones. */
export function CartPanel() {
  const { cartOpen, setCartOpen, summary } = useAppState();
  const pathname = usePathname();

  // Close the cart when the page changes (e.g. after clicking Checkout).
  useEffect(() => {
    setCartOpen(false);
  }, [pathname, setCartOpen]);

  const empty = summary.lines.length === 0;

  return (
    <Modal open={cartOpen} onClose={() => setCartOpen(false)} variant="side" labelledBy="cart-title" testId="cart-panel">
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-line bg-white px-5 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <h2 id="cart-title" className="text-2xl font-extrabold">
            Your cart
          </h2>
          <button
            type="button"
            onClick={() => setCartOpen(false)}
            className="grid size-11 place-items-center rounded-full hover:bg-crust"
            aria-label="Close cart"
          >
            <CloseIcon />
          </button>
        </div>

        {empty ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-crust text-brand">
              <CartIcon className="size-8" />
            </span>
            <p className="font-display text-xl font-bold">Your cart is empty</p>
            <p className="text-ink-soft">Pick something tasty from the menu, or ask the assistant to add it for you.</p>
            <button
              type="button"
              onClick={() => setCartOpen(false)}
              className="mt-2 min-h-11 rounded-full bg-brand px-5 font-bold text-white hover:bg-brand-dark"
            >
              Browse the menu
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <FulfilmentToggle />
              <CartLines editable className="mt-4" />
            </div>
            <div className="shrink-0 border-t border-line bg-white px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <CartTotals />
              <Link
                href="/checkout"
                data-testid="go-to-checkout"
                className="mt-4 flex min-h-12 items-center justify-between rounded-full bg-brand px-5 font-bold text-white hover:bg-brand-dark"
              >
                <span>Go to checkout</span>
                <span className="tabular-nums">{formatRM(summary.totalSen)}</span>
              </Link>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
