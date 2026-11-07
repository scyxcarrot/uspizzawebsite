"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppState } from "@/components/AppStateProvider";
import { CartIcon, TruckIcon } from "@/components/Icons";

export function SiteHeader() {
  const { summary, ready, setCartOpen } = useAppState();
  const pathname = usePathname();
  const count = ready ? summary.itemCount : 0;

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-full max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex min-h-11 flex-col justify-center leading-none" aria-label="US Pizza Demo, menu">
          <span className="font-display text-xl font-extrabold tracking-tight text-brand sm:text-2xl" data-testid="site-name">
            US Pizza <span className="text-ink">Demo</span>
          </span>
        </Link>

        <nav aria-label="Main" className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link
            href="/"
            aria-current={pathname === "/" ? "page" : undefined}
            className="hidden min-h-11 items-center rounded-full px-3 font-semibold hover:bg-crust aria-[current=page]:text-brand md:inline-flex"
          >
            Menu
          </Link>
          <Link
            href="/track"
            aria-current={pathname === "/track" ? "page" : undefined}
            className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full px-2 font-semibold hover:bg-crust aria-[current=page]:text-brand sm:px-3"
          >
            <TruckIcon />
            <span className="sr-only sm:not-sr-only">Track order</span>
          </Link>
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            data-testid="header-cart"
            className="relative inline-flex min-h-11 items-center gap-2 rounded-full bg-brand px-4 font-bold text-white hover:bg-brand-dark"
            aria-label={`Cart, ${count} ${count === 1 ? "item" : "items"}`}
          >
            <CartIcon />
            <span className="hidden sm:inline">Cart</span>
            <span
              className="grid min-w-6 place-items-center rounded-full bg-white px-1.5 text-sm text-brand tabular-nums"
              data-testid="cart-count"
            >
              {count}
            </span>
          </button>
        </nav>
      </div>
    </header>
  );
}
