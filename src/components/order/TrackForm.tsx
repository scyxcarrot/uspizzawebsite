"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { SEEDED_ORDERS } from "@/data/orders";
import { findOrder, getOrderStatus, normaliseOrderId, statusLabel } from "@/lib/orders";
import { formatRM } from "@/lib/money";
import { useAppState } from "@/components/AppStateProvider";

export function TrackForm() {
  const { ready, orders } = useAppState();
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const id = normaliseOrderId(value);
    if (!id) {
      setError("Order IDs look like US-2001. Please check and try again.");
      return;
    }
    if (!findOrder(id, SEEDED_ORDERS, orders)) {
      setError(
        `We couldn't find order ${id}. Orders are saved only in the browser they were placed in. Try US-1001, US-1002 or US-1003 for a sample.`,
      );
      return;
    }
    setError(null);
    router.push(`/order/${id}`);
  }

  return (
    <>
      <form onSubmit={handleSubmit} noValidate className="mt-6 rounded-card border border-line bg-white p-5 shadow-card">
        <label htmlFor="order-id" className="block font-semibold">
          Order ID
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="order-id"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="US-2001"
            autoCapitalize="characters"
            autoComplete="off"
            className={`min-h-12 flex-1 rounded-xl border-2 bg-white px-3 text-base uppercase ${error ? "border-brand" : "border-line focus:border-ink"}`}
            aria-invalid={!!error}
            aria-describedby={error ? "order-id-error" : undefined}
          />
          <button type="submit" className="min-h-12 rounded-full bg-brand px-6 font-bold text-white hover:bg-brand-dark">
            Track order
          </button>
        </div>
        {error && (
          <p id="order-id-error" role="alert" className="mt-2 text-sm font-medium text-brand-dark" data-testid="track-error">
            {error}
          </p>
        )}
      </form>

      <section aria-labelledby="recent-title" className="mt-8">
        <h2 id="recent-title" className="text-xl font-extrabold">
          Your orders in this browser
        </h2>
        {!ready ? (
          <p className="mt-2 text-ink-soft" role="status">
            Loading…
          </p>
        ) : orders.length === 0 ? (
          <p className="mt-2 text-ink-soft">You haven&apos;t placed any demo orders yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {orders.map((o) => (
              <li key={o.id}>
                <OrderLink id={o.id} detail={`${formatRM(o.totalSen)} · ${statusLabel(getOrderStatus(o, new Date()), o.fulfilment)}`} />
              </li>
            ))}
          </ul>
        )}

        <h2 className="mt-8 text-xl font-extrabold">Sample orders</h2>
        <ul className="mt-3 space-y-2">
          {SEEDED_ORDERS.map((o) => (
            <li key={o.id}>
              <OrderLink id={o.id} detail={o.fixedStatus ? statusLabel(o.fixedStatus, o.fulfilment) : ""} />
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function OrderLink({ id, detail }: { id: string; detail: string }) {
  return (
    <Link
      href={`/order/${id}`}
      className="flex min-h-12 items-center justify-between rounded-xl border border-line bg-white px-4 py-2 hover:border-ink"
    >
      <span className="font-semibold">{id}</span>
      <span className="text-sm text-ink-soft">{detail}</span>
    </Link>
  );
}
