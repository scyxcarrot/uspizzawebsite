"use client";

// A thin wrapper around the native <dialog> element. showModal() gives us
// focus trapping, Escape to close, and a backdrop for free.
//
// Variants:
// - "center": full-screen on phones, centred dialog on tablet/desktop
// - "side":   full-screen on phones, right-hand side panel on tablet/desktop

import { useEffect, useRef, type ReactNode } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  variant: "center" | "side";
  labelledBy: string;
  children: ReactNode;
  testId?: string;
};

const VARIANT_CLASSES = {
  center:
    "m-0 h-[100dvh] w-full md:m-auto md:h-auto md:max-h-[88dvh] md:w-[560px] md:rounded-[var(--radius-card)] anim-sheet",
  side: "m-0 h-[100dvh] w-full md:ml-auto md:w-[420px] anim-slide",
};

export function Modal({ open, onClose, variant, labelledBy, children, testId }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      data-testid={testId}
      className={`overflow-hidden bg-cream shadow-[var(--shadow-pop)] ${VARIANT_CLASSES[variant]}`}
      // Escape key and dialog.close() both fire "close".
      onClose={onClose}
      // Clicking the backdrop (the dialog element itself, outside the content) closes it.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open ? children : null}
    </dialog>
  );
}
