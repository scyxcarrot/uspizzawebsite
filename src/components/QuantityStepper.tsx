"use client";

import { MAX_QUANTITY_PER_LINE } from "@/lib/cart";
import { MinusIcon, PlusIcon, TrashIcon } from "@/components/Icons";

type Props = {
  value: number;
  onChange: (next: number) => void;
  label: string;
  /** Show a remove (bin) icon instead of minus when the value is 1. */
  allowRemove?: boolean;
  size?: "md" | "lg";
};

export function QuantityStepper({ value, onChange, label, allowRemove = false, size = "md" }: Props) {
  const btn =
    size === "lg"
      ? "size-12 rounded-full"
      : "size-11 rounded-full";
  const canDecrease = allowRemove ? value >= 1 : value > 1;
  const showRemove = allowRemove && value === 1;

  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-line bg-white p-0.5" role="group" aria-label={label}>
      <button
        type="button"
        className={`${btn} grid place-items-center text-ink hover:bg-crust disabled:opacity-40`}
        onClick={() => onChange(value - 1)}
        disabled={!canDecrease}
        aria-label={showRemove ? `Remove ${label}` : `Decrease quantity of ${label}`}
      >
        {showRemove ? <TrashIcon /> : <MinusIcon />}
      </button>
      <span className="min-w-7 text-center font-semibold tabular-nums" aria-live="polite">
        <span className="sr-only">Quantity </span>
        {value}
      </span>
      <button
        type="button"
        className={`${btn} grid place-items-center text-ink hover:bg-crust disabled:opacity-40`}
        onClick={() => onChange(value + 1)}
        disabled={value >= MAX_QUANTITY_PER_LINE}
        aria-label={`Increase quantity of ${label}`}
      >
        <PlusIcon />
      </button>
    </div>
  );
}
