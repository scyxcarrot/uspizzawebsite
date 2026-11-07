"use client";

// Cards drawn under an assistant reply. The data comes from tool results
// (built by code, validated again in the browser), and every name and price
// shown here comes from the menu and pricing code, never from the model.
// Card buttons act in code; none of them calls the AI.

import type { ChatCard, PlanCard } from "@/lib/chat/cards";
import { describeLine } from "@/lib/cart";
import { formatRM } from "@/lib/money";
import { priceCart } from "@/lib/pricing";
import { CartIcon } from "@/components/Icons";

type CardProps = { onAddPlan: (plan: PlanCard) => void };

export function ChatCards({ cards, ...props }: { cards: ChatCard[] } & CardProps) {
  return (
    <>
      {cards.map((card, i) => {
        switch (card.kind) {
          case "plan":
            return <PlanCardView key={i} plan={card} onAdd={() => props.onAddPlan(card)} />;
          default:
            return null;
        }
      })}
    </>
  );
}

function PlanCardView({ plan, onAdd }: { plan: PlanCard; onAdd: () => void }) {
  const s = priceCart(plan.lines, plan.fulfilment);
  const perPerson = Math.round(s.totalSen / plan.people);
  return (
    <section
      className="overflow-hidden rounded-2xl border-2 border-gold bg-white shadow-card"
      aria-label={`Group order plan for ${plan.people} people`}
      data-testid="chat-plan-card"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 bg-gold-tint px-3.5 py-2.5">
        <h3 className="font-display text-base font-extrabold">Group order for {plan.people}</h3>
        <p className="text-sm font-semibold text-ink-soft">
          {plan.budgetSen !== undefined ? `Budget ${formatRM(plan.budgetSen)}` : "No budget set"}
        </p>
      </header>
      <ul className="divide-y divide-line px-3.5 text-sm">
        {s.lines.map((l) => (
          <li key={l.lineId} className="flex items-start justify-between gap-3 py-2">
            <span className="min-w-0 break-words">
              <span className="font-bold">{l.quantity} ×</span> {describeLine(l)}
            </span>
            <span className="shrink-0 tabular-nums">{formatRM(l.lineTotalSen)}</span>
          </li>
        ))}
      </ul>
      <dl className="space-y-1 border-t border-line px-3.5 py-2.5 text-sm" data-testid="chat-plan-totals">
        <div className="flex justify-between gap-3">
          <dt>Subtotal</dt>
          <dd className="tabular-nums">{formatRM(s.subtotalSen)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>{plan.fulfilment === "pickup" ? "Pickup" : "Delivery"}</dt>
          <dd className="tabular-nums">{s.deliveryFeeSen === 0 ? "Free" : formatRM(s.deliveryFeeSen)}</dd>
        </div>
        <div className="flex justify-between gap-3 text-base font-extrabold">
          <dt>Total</dt>
          <dd className="tabular-nums" data-testid="chat-plan-total">
            {formatRM(s.totalSen)}
          </dd>
        </div>
        <div className="flex justify-between gap-3 text-ink-soft">
          <dt>Per person</dt>
          <dd className="tabular-nums">{formatRM(perPerson)}</dd>
        </div>
      </dl>
      {(plan.adjustments.length > 0 || plan.relaxed.length > 0 || plan.freeDeliveryHint || plan.deliveryMinimumNote) && (
        <ul className="space-y-1 border-t border-line px-3.5 py-2.5 text-sm text-ink-soft" data-testid="chat-plan-notes">
          {!plan.withinBudget && <li className="font-bold text-brand">Over budget: this is the closest option.</li>}
          {[...plan.adjustments, ...plan.relaxed].map((n) => (
            <li key={n}>• {n}</li>
          ))}
          {plan.deliveryMinimumNote && <li>• {plan.deliveryMinimumNote}</li>}
          {plan.freeDeliveryHint && <li>• {plan.freeDeliveryHint}</li>}
        </ul>
      )}
      <div className="border-t border-line p-3">
        {plan.added ? (
          <p className="flex min-h-11 items-center justify-center gap-2 font-bold text-basil" data-testid="chat-plan-added">
            <CartIcon className="size-4" /> Added to your cart
          </p>
        ) : (
          <button
            type="button"
            onClick={onAdd}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-brand px-4 font-bold text-white hover:bg-brand-dark"
            data-testid="chat-plan-add"
          >
            <CartIcon className="size-4" /> Add all to cart
          </button>
        )}
      </div>
    </section>
  );
}
