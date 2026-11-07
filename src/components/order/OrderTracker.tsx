"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SEEDED_ORDERS } from "@/data/orders";
import { STORE } from "@/data/store";
import { findOutlet } from "@/data/outlets";
import { formatRM } from "@/lib/money";
import {
  ORDER_STATUSES,
  canCancelFree,
  findOrder,
  getOrderStatus,
  statusLabel,
  type Order,
} from "@/lib/orders";
import { formatOrderTime } from "@/lib/time";
import { useAppState } from "@/components/AppStateProvider";
import { CheckIcon } from "@/components/Icons";

export function OrderTracker({ id }: { id: string }) {
  const { ready, orders } = useAppState();
  const now = useNow(1000);

  if (!ready) {
    return (
      <div role="status" className="animate-pulse space-y-4">
        <span className="sr-only">Loading order…</span>
        <div className="h-10 w-2/3 rounded-xl bg-crust" />
        <div className="h-40 rounded-card bg-crust" />
      </div>
    );
  }

  const order = findOrder(id, SEEDED_ORDERS, orders);
  if (!order) return <OrderNotFound id={id} />;

  return <OrderDetails order={order} now={now} isNew={!order.fixedStatus} />;
}

/** Re-render every `intervalMs` so the status updates without a refresh. */
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function OrderDetails({ order, now, isNew }: { order: Order; now: Date; isNew: boolean }) {
  const status = getOrderStatus(order, now);
  const currentIndex = ORDER_STATUSES.indexOf(status);
  const label = statusLabel(status, order.fulfilment);
  const firstName = order.customer.name.split(" ")[0];
  const done = status === "delivered";
  const outlet = order.outletId ? findOutlet(order.outletId) : undefined;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-semibold text-brand">Order {order.id}</p>
        <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">
          {isNew && firstName ? `Thanks, ${firstName}! Your demo order is in.` : `Order ${order.id}`}
        </h1>
        <p className="mt-2 text-ink-soft">
          Placed {formatOrderTime(order.placedAt)} · {order.fulfilment === "delivery" ? "Delivery" : "Pickup"}
          {isNew && " · This status updates every few seconds using sped-up demo timings."}
        </p>
        {outlet && (
          <p className="mt-1 font-semibold" data-testid="order-outlet">
            {order.fulfilment === "pickup" ? "Pickup at " : "From "}
            {outlet.name}
          </p>
        )}
      </div>

      <section aria-labelledby="status-title" className="rounded-card border border-line bg-white p-5 shadow-card">
        <h2 id="status-title" className="sr-only">
          Order status
        </h2>
        <p className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Current status</p>
        <p className="mt-1 font-display text-3xl font-extrabold text-brand" aria-live="polite" data-testid="order-status">
          {label}
        </p>
        <p className="mt-1 text-ink-soft">
          {done
            ? "Enjoy your meal!"
            : order.fulfilment === "delivery"
              ? `Estimated delivery: ${STORE.delivery.estimatedMinutes.min}–${STORE.delivery.estimatedMinutes.max} minutes from ordering.`
              : `Pickup is usually ready in about ${STORE.pickup.readyInMinutes} minutes.`}
        </p>

        <ol className="mt-5 grid gap-3 sm:grid-cols-5 sm:gap-2" aria-label="Order progress">
          {ORDER_STATUSES.map((s, i) => {
            const state = i < currentIndex ? "done" : i === currentIndex ? "current" : "todo";
            return (
              <li
                key={s}
                aria-current={state === "current" ? "step" : undefined}
                className="flex items-center gap-3 sm:flex-col sm:items-start sm:gap-2"
              >
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${
                    state === "done"
                      ? "bg-basil text-white"
                      : state === "current"
                        ? "bg-brand text-white ring-4 ring-brand-tint"
                        : "bg-crust text-ink-soft"
                  }`}
                >
                  {state === "done" ? <CheckIcon /> : i + 1}
                </span>
                <span className={`text-sm ${state === "todo" ? "text-ink-soft" : "font-semibold"}`}>
                  {statusLabel(s, order.fulfilment)}
                  {state === "done" && <span className="sr-only"> (done)</span>}
                  {state === "current" && <span className="sr-only"> (current)</span>}
                </span>
              </li>
            );
          })}
        </ol>
        {isNew && (
          <p className="mt-4 text-sm text-ink-soft">
            {canCancelFree(status)
              ? "Cancellation is free until your order reaches Baking."
              : "This order has reached Baking, so it can no longer be cancelled."}
          </p>
        )}
      </section>

      <section aria-labelledby="items-title" className="rounded-card border border-line bg-white p-5 shadow-card">
        <h2 id="items-title" className="text-xl font-extrabold">
          Order details
        </h2>
        <ul className="mt-2 divide-y divide-line">
          {order.lines.map((line) => (
            <li key={line.lineId} className="flex justify-between gap-3 py-2.5">
              <span>
                <span className="tabular-nums">{line.quantity} × </span>
                <span className="font-semibold">{line.name}</span>
                {line.optionsLabel && <span className="block text-sm text-ink-soft">{line.optionsLabel}</span>}
              </span>
              <span className="tabular-nums">{formatRM(line.lineTotalSen)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-2 space-y-1 border-t border-line pt-3 text-sm">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatRM(order.subtotalSen)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{order.fulfilment === "delivery" ? "Delivery fee" : "Pickup"}</dt>
            <dd className="tabular-nums">{order.deliveryFeeSen ? formatRM(order.deliveryFeeSen) : "Free"}</dd>
          </div>
          <div className="flex justify-between text-base font-bold">
            <dt>Total (pay on {order.fulfilment === "delivery" ? "delivery" : "pickup"}, demo)</dt>
            <dd className="tabular-nums" data-testid="order-total">
              {formatRM(order.totalSen)}
            </dd>
          </div>
        </dl>
        {isNew && (
          <p className="mt-4 text-sm text-ink-soft">
            {order.fulfilment === "delivery" && order.customer.address
              ? `Delivering to: ${order.customer.address}`
              : "Pickup from the demo store."}
          </p>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href="/" className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 font-bold text-white hover:bg-brand-dark">
          Back to menu
        </Link>
        <Link href="/track" className="inline-flex min-h-11 items-center rounded-full border-2 border-ink px-5 font-bold hover:bg-crust">
          Track another order
        </Link>
      </div>
    </div>
  );
}

function OrderNotFound({ id }: { id: string }) {
  return (
    <div className="rounded-card border border-line bg-white p-6 shadow-card" data-testid="order-not-found">
      <h1 className="text-2xl font-extrabold sm:text-3xl">We couldn&apos;t find that order</h1>
      <p className="mt-2 text-ink-soft">
        There is no order with the ID <strong className="text-ink">{id}</strong> in this demo. Orders you place are
        saved only in this browser, so they won&apos;t appear on another device.
      </p>
      <p className="mt-2 text-ink-soft">Order IDs look like US-2001. You can also try the sample orders US-1001, US-1002 or US-1003.</p>
      <Link href="/track" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-brand px-5 font-bold text-white hover:bg-brand-dark">
        Try another order ID
      </Link>
    </div>
  );
}
