"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { validateCheckout, type CheckoutErrors } from "@/lib/checkout";
import { formatRM } from "@/lib/money";
import { useAppState } from "@/components/AppStateProvider";
import { CartLines, CartTotals, FulfilmentToggle } from "@/components/cart/CartParts";

export function CheckoutView() {
  const { ready, summary, fulfilment, placeOrder, setCartOpen } = useAppState();
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [errors, setErrors] = useState<CheckoutErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [placing, setPlacing] = useState(false);

  const form = { fulfilment, name, phone, address };
  // After the first submit, re-validate as the customer types.
  const shownErrors = submitted ? validateCheckout(form, summary) : errors;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const result = validateCheckout(form, summary);
    setErrors(result);
    if (Object.keys(result).length > 0) {
      // Move focus to the first field with a problem.
      const first = (["name", "phone", "address"] as const).find((k) => result[k]);
      if (first) document.getElementById(`checkout-${first}`)?.focus();
      return;
    }
    setPlacing(true);
    const order = placeOrder({ name: name.trim(), phone: phone.trim(), address: address.trim() });
    router.push(`/order/${order.id}`);
  }

  if (!ready || placing) {
    return (
      <PageShell>
        <div className="grid min-h-60 place-items-center" role="status">
          <p className="text-ink-soft">{placing ? "Placing your order…" : "Loading your cart…"}</p>
        </div>
      </PageShell>
    );
  }

  if (summary.lines.length === 0) {
    return (
      <PageShell>
        <div className="rounded-card border border-line bg-white p-8 text-center shadow-card">
          <p className="font-display text-xl font-bold">Your cart is empty</p>
          <p className="mt-1 text-ink-soft">Add something from the menu before checking out.</p>
          <Link href="/" className="mt-4 inline-flex min-h-11 items-center rounded-full bg-brand px-5 font-bold text-white hover:bg-brand-dark">
            Browse the menu
          </Link>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        {/* Order summary: first on phones and tablets, on the right on desktop */}
        <section
          aria-labelledby="summary-title"
          className="rounded-card border border-line bg-white p-5 shadow-card lg:sticky lg:top-24 lg:order-2"
        >
          <div className="flex items-center justify-between">
            <h2 id="summary-title" className="text-xl font-extrabold">
              Order summary
            </h2>
            <button type="button" onClick={() => setCartOpen(true)} className="min-h-11 rounded-full px-3 font-semibold text-brand hover:bg-brand-tint">
              Edit cart
            </button>
          </div>
          <CartLines editable={false} className="mt-1" />
          <div className="mt-2 border-t border-line pt-3">
            <CartTotals />
          </div>
        </section>

        <form onSubmit={handleSubmit} noValidate className="space-y-6 lg:order-1" aria-labelledby="checkout-title">
          <section className="rounded-card border border-line bg-white p-5 shadow-card">
            <h2 className="mb-3 text-xl font-extrabold">How would you like it?</h2>
            <FulfilmentToggle />
          </section>

          <section className="rounded-card border border-line bg-white p-5 shadow-card">
            <h2 className="mb-3 text-xl font-extrabold">Your details</h2>
            <div className="space-y-4">
              <Field id="checkout-name" label="Full name" error={shownErrors.name}>
                <input
                  id="checkout-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  className={inputClass(!!shownErrors.name)}
                  aria-invalid={!!shownErrors.name}
                  aria-describedby={shownErrors.name ? "checkout-name-error" : undefined}
                />
              </Field>
              <Field id="checkout-phone" label="Phone number" hint="For example 012-345 6789" error={shownErrors.phone}>
                <input
                  id="checkout-phone"
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  className={inputClass(!!shownErrors.phone)}
                  aria-invalid={!!shownErrors.phone}
                  aria-describedby={`checkout-phone-hint${shownErrors.phone ? " checkout-phone-error" : ""}`}
                />
              </Field>
              {fulfilment === "delivery" && (
                <Field id="checkout-address" label="Delivery address" hint="Within the Klang Valley" error={shownErrors.address}>
                  <textarea
                    id="checkout-address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    autoComplete="street-address"
                    rows={3}
                    className={inputClass(!!shownErrors.address)}
                    aria-invalid={!!shownErrors.address}
                    aria-describedby={`checkout-address-hint${shownErrors.address ? " checkout-address-error" : ""}`}
                  />
                </Field>
              )}
            </div>
          </section>

          <section className="rounded-card border border-line bg-white p-5 shadow-card">
            <h2 className="mb-3 text-xl font-extrabold">Payment</h2>
            <fieldset>
              <legend className="sr-only">Payment method</legend>
              <label className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-brand bg-brand-tint px-3 py-2">
                <input type="radio" name="payment" checked readOnly className="size-5 accent-brand" />
                <span>
                  <span className="block font-semibold">Pay on delivery or pickup (demo)</span>
                  <span className="block text-sm text-ink-soft">No real payment is taken. This is a demo.</span>
                </span>
              </label>
            </fieldset>
          </section>

          {shownErrors.cart && (
            <p role="alert" className="rounded-xl bg-gold-tint px-4 py-3 font-medium" data-testid="checkout-cart-error">
              {shownErrors.cart}
            </p>
          )}

          <button
            type="submit"
            data-testid="place-order"
            className="flex min-h-14 w-full items-center justify-between rounded-full bg-brand px-6 text-lg font-bold text-white hover:bg-brand-dark"
          >
            <span>Place demo order</span>
            <span className="tabular-nums">{formatRM(summary.totalSen)}</span>
          </button>
          <p className="text-center text-sm text-ink-soft">
            This places a pretend order stored only in your browser. Nothing is sent to a restaurant.
          </p>
        </form>
      </div>
    </PageShell>
  );
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 id="checkout-title" className="mb-6 text-3xl font-extrabold sm:text-4xl">
        Checkout
      </h1>
      {children}
    </div>
  );
}

function inputClass(invalid: boolean) {
  return `block w-full rounded-xl border-2 bg-white px-3 py-2.5 text-base min-h-12 ${
    invalid ? "border-brand" : "border-line focus:border-ink"
  }`;
}

function Field(props: { id: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={props.id} className="mb-1 block font-semibold">
        {props.label}
      </label>
      {props.hint && (
        <p id={`${props.id}-hint`} className="mb-1.5 text-sm text-ink-soft">
          {props.hint}
        </p>
      )}
      {props.children}
      {props.error && (
        <p id={`${props.id}-error`} className="mt-1.5 text-sm font-medium text-brand-dark">
          {props.error}
        </p>
      )}
    </div>
  );
}
