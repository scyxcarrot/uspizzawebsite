"use client";

// Building blocks shared by the cart panel and the checkout summary.

import Image from "next/image";
import { findMenuItem } from "@/data/menu";
import { STORE } from "@/data/store";
import { formatRM } from "@/lib/money";
import { useAppState } from "@/components/AppStateProvider";
import { StoreIcon, TruckIcon } from "@/components/Icons";
import { QuantityStepper } from "@/components/QuantityStepper";

export function CartLines({ editable, className = "" }: { editable: boolean; className?: string }) {
  const { summary, setQuantity } = useAppState();

  return (
    <ul className={`divide-y divide-line ${className}`} data-testid="cart-lines">
      {summary.lines.map((line) => {
        const item = findMenuItem(line.itemId);
        return (
          <li key={line.lineId} className="flex gap-3 py-3" data-testid="cart-line">
            {item && (
              <Image src={item.image} alt="" width={64} height={48} className="h-12 w-16 shrink-0 rounded-lg object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold leading-tight">
                    {!editable && <span className="tabular-nums">{line.quantity} × </span>}
                    {line.name}
                  </p>
                  {line.optionsLabel && <p className="text-sm text-ink-soft">{line.optionsLabel}</p>}
                  {line.soldOut && (
                    <p className="mt-0.5 text-sm font-bold text-brand-dark" data-testid="cart-line-sold-out">
                      Sold out. Please remove it to check out.
                    </p>
                  )}
                </div>
                <p className="shrink-0 font-semibold tabular-nums">{formatRM(line.lineTotalSen)}</p>
              </div>
              {editable && (
                <div className="mt-2 flex items-center justify-between gap-2">
                  <QuantityStepper
                    value={line.quantity}
                    onChange={(q) => setQuantity(line.lineId, q)}
                    label={[line.optionsLabel, line.name].filter(Boolean).join(" ")}
                    allowRemove
                  />
                  <span className="text-xs text-ink-soft tabular-nums">{formatRM(line.unitPriceSen)} each</span>
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function CartTotals() {
  const { summary } = useAppState();
  const isDelivery = summary.fulfilment === "delivery";

  return (
    <div>
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd className="tabular-nums" data-testid="subtotal">
            {formatRM(summary.subtotalSen)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt>{isDelivery ? "Delivery fee" : "Pickup"}</dt>
          <dd className="tabular-nums" data-testid="delivery-fee">
            {summary.deliveryFeeSen === 0 ? "Free" : formatRM(summary.deliveryFeeSen)}
          </dd>
        </div>
        <div className="flex justify-between border-t border-line pt-2 text-base font-bold">
          <dt>Total</dt>
          <dd className="tabular-nums" data-testid="total">
            {formatRM(summary.totalSen)}
          </dd>
        </div>
      </dl>
      {isDelivery && !summary.meetsMinimum && (
        <p className="mt-3 rounded-xl bg-gold-tint px-3 py-2 text-sm" data-testid="minimum-warning">
          Delivery needs a food subtotal of at least {formatRM(STORE.delivery.minimumOrderSen)}. Add{" "}
          <strong>{formatRM(summary.amountToMinimumSen)}</strong> more, or switch to pickup.
        </p>
      )}
      {isDelivery && summary.meetsMinimum && summary.amountToFreeDeliverySen > 0 && (
        <p className="mt-3 text-sm text-ink-soft">
          Add {formatRM(summary.amountToFreeDeliverySen)} more for free delivery.
        </p>
      )}
    </div>
  );
}

export function FulfilmentToggle() {
  const { fulfilment, setFulfilment } = useAppState();
  const options = [
    { id: "delivery" as const, label: "Delivery", detail: `${STORE.delivery.estimatedMinutes.min}–${STORE.delivery.estimatedMinutes.max} min`, Icon: TruckIcon },
    { id: "pickup" as const, label: "Pickup", detail: `Ready in ~${STORE.pickup.readyInMinutes} min`, Icon: StoreIcon },
  ];
  return (
    <fieldset>
      <legend className="sr-only">Delivery or pickup</legend>
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-crust p-1">
        {options.map(({ id, label, detail, Icon }) => (
          <label
            key={id}
            className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl px-2 py-1.5 text-center transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-gold ${
              fulfilment === id ? "bg-white shadow-card" : "text-ink-soft hover:text-ink"
            }`}
          >
            <input
              type="radio"
              name="fulfilment"
              value={id}
              checked={fulfilment === id}
              onChange={() => setFulfilment(id)}
              className="sr-only"
              data-testid={`fulfilment-${id}`}
            />
            <Icon />
            <span className="flex flex-col leading-tight">
              <span className="font-semibold">{label}</span>
              <span className="text-xs">{detail}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
