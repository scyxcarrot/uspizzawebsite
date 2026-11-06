"use client";

import { useAppState } from "@/components/AppStateProvider";
import { CheckIcon } from "@/components/Icons";

/** Short confirmation such as "Added to cart: 2 × Large Beef Pepperoni". */
export function NoticeToast() {
  const { notice } = useAppState();
  return (
    // The live region is always in the DOM so screen readers announce changes.
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-20 z-50 flex justify-center px-4">
      {notice && (
        <p
          key={notice.id}
          data-testid="notice"
          className="anim-sheet flex max-w-md items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-pop)]"
        >
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-basil">
            <CheckIcon className="size-3.5" />
          </span>
          {notice.text}
        </p>
      )}
    </div>
  );
}
