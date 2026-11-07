"use client";

// Cards drawn under an assistant reply. The data comes from tool results
// (built by code, validated again in the browser), and every name and price
// shown here comes from the menu and pricing code, never from the model.
// Card buttons act in code; none of them calls the AI.

import Image from "next/image";
import Link from "next/link";
import { SEEDED_ORDERS } from "@/data/orders";
import { findMenuItem, type MenuItem, type SizeId } from "@/data/menu";
import type { ChatCard, PlanCard } from "@/lib/chat/cards";
import { describeLine, type CartLine } from "@/lib/cart";
import { formatRM } from "@/lib/money";
import { ORDER_STATUSES, findOrder, getOrderStatus, statusLabel, type Order } from "@/lib/orders";
import { priceCart, type Fulfilment } from "@/lib/pricing";
import { useAppState } from "@/components/AppStateProvider";
import { CartIcon } from "@/components/Icons";
import { TagList } from "@/components/menu/Tags";
import { useNow } from "@/components/order/OrderTracker";

type CardProps = { onAddPlan: (plan: PlanCard) => void; onViewCart: () => void };

export function ChatCards({ cards, ...props }: { cards: ChatCard[] } & CardProps) {
  return (
    <>
      {cards.map((card, i) => {
        switch (card.kind) {
          case "plan":
            return <PlanCardView key={i} plan={card} onAdd={() => props.onAddPlan(card)} />;
          case "items":
            return <ItemsCard key={i} itemIds={card.itemIds} more={card.more} />;
          case "cart":
            return <CartCard key={i} lines={card.lines} fulfilment={card.fulfilment} onViewCart={props.onViewCart} />;
          case "order":
            return <OrderCard key={i} orderId={card.orderId} />;
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

const cardBox = "overflow-hidden rounded-2xl border border-line bg-white shadow-card";

/** Menu items with quick-add buttons. Pizzas get one button per size (Hand-Tossed crust). */
function ItemsCard({ itemIds, more }: { itemIds: string[]; more: number }) {
  const items = itemIds.map((id) => findMenuItem(id)).filter((i): i is MenuItem => !!i);
  return (
    <section className={cardBox} aria-label="Menu items" data-testid="chat-items-card">
      <ul className="divide-y divide-line">
        {items.map((item) => (
          <ItemRow key={item.id} item={item} />
        ))}
      </ul>
      {more > 0 && (
        <p className="border-t border-line px-3 py-2 text-sm text-ink-soft">
          And {more} more on the <Link href="/" className="font-semibold text-brand underline underline-offset-2">menu</Link>.
        </p>
      )}
    </section>
  );
}

function ItemRow({ item }: { item: MenuItem }) {
  const { addItem, showNotice } = useAppState();
  const add = (size?: SizeId) => {
    const result = addItem(
      item.kind === "pizza" ? { itemId: item.id, quantity: 1, size, crust: "hand-tossed" } : { itemId: item.id, quantity: 1 },
    );
    showNotice(result.ok ? result.message : result.error, result.ok ? "success" : "info");
  };
  const button =
    "inline-flex min-h-11 items-center justify-center gap-1 rounded-full border-2 border-ink px-3 text-sm font-bold hover:bg-ink hover:text-white";
  return (
    <li className="flex gap-3 p-3" data-testid="chat-item-card" data-item-id={item.id}>
      <Image src={item.image} alt="" width={64} height={64} className="size-16 shrink-0 rounded-xl object-cover" />
      <div className="min-w-0 flex-1">
        <p className="font-bold leading-tight">{item.name}</p>
        <p className="mt-0.5 text-sm text-ink-soft">
          {item.kind === "pizza"
            ? `Regular ${formatRM(item.priceBySize.regular)} · Large ${formatRM(item.priceBySize.large)}`
            : formatRM(item.price)}
        </p>
        {item.tags.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            <TagList tags={item.tags} />
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          {item.soldOut ? (
            <span className="rounded-full bg-crust px-3 py-1 text-sm font-bold text-ink-soft" data-testid="chat-card-sold-out">
              Sold out
            </span>
          ) : item.kind === "pizza" ? (
            <>
              <button type="button" className={button} onClick={() => add("regular")} aria-label={`Add a Regular ${item.name}`}>
                + Regular
              </button>
              <button type="button" className={button} onClick={() => add("large")} aria-label={`Add a Large ${item.name}`}>
                + Large
              </button>
            </>
          ) : (
            <button type="button" className={button} onClick={() => add()} aria-label={`Add ${item.name}`}>
              + Add
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/** The cart as it was when the assistant checked it. */
function CartCard({ lines, fulfilment, onViewCart }: { lines: CartLine[]; fulfilment: Fulfilment; onViewCart: () => void }) {
  const s = priceCart(lines, fulfilment);
  return (
    <section className={cardBox} aria-label="Cart summary" data-testid="chat-cart-card">
      <p className="bg-crust px-3.5 py-2 text-sm font-bold">Your cart</p>
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
      <dl className="space-y-1 border-t border-line px-3.5 py-2.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt>{fulfilment === "pickup" ? "Pickup" : "Delivery"}</dt>
          <dd className="tabular-nums">{s.deliveryFeeSen === 0 ? "Free" : formatRM(s.deliveryFeeSen)}</dd>
        </div>
        <div className="flex justify-between gap-3 font-extrabold">
          <dt>Total</dt>
          <dd className="tabular-nums" data-testid="chat-cart-card-total">
            {formatRM(s.totalSen)}
          </dd>
        </div>
      </dl>
      {!s.meetsMinimum && (
        <p className="border-t border-line px-3.5 py-2 text-sm text-ink-soft">
          Delivery needs at least {formatRM(s.subtotalSen + s.amountToMinimumSen)} of food. Add {formatRM(s.amountToMinimumSen)} more, or choose pickup.
        </p>
      )}
      <div className="flex flex-wrap gap-2 border-t border-line p-3">
        <button
          type="button"
          onClick={onViewCart}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full border-2 border-ink px-4 text-sm font-bold"
        >
          View cart
        </button>
        <Link
          href="/checkout"
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-brand px-4 text-sm font-bold text-white hover:bg-brand-dark"
        >
          Checkout
        </Link>
      </div>
    </section>
  );
}

/** An order's live status, worked out in the browser from the order time. */
function OrderCard({ orderId }: { orderId: string }) {
  const { orders } = useAppState();
  const order = findOrder(orderId, SEEDED_ORDERS, orders);
  if (!order) return null;
  return <OrderCardBody order={order} />;
}

function OrderCardBody({ order }: { order: Order }) {
  const now = useNow(5000);
  const status = getOrderStatus(order, now);
  const step = ORDER_STATUSES.indexOf(status);
  const percent = Math.round((step / (ORDER_STATUSES.length - 1)) * 100);
  const label = statusLabel(status, order.fulfilment);
  return (
    <section className={`${cardBox} p-3.5`} aria-label={`Order ${order.id}`} data-testid="chat-order-card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="font-bold">Order {order.id}</p>
        <p className="text-sm text-ink-soft">{formatRM(order.totalSen)}</p>
      </div>
      <p className="mt-1 font-display text-lg font-extrabold text-brand" data-testid="chat-order-status">
        {label}
      </p>
      <div
        className="mt-2 h-2.5 overflow-hidden rounded-full bg-crust"
        role="progressbar"
        aria-label="Order progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${label}: step ${step + 1} of ${ORDER_STATUSES.length}`}
      >
        <div className="h-full rounded-full bg-brand transition-[width] duration-500" style={{ width: `${Math.max(percent, 6)}%` }} />
      </div>
      <p className="mt-1 text-xs text-ink-soft">
        Step {step + 1} of {ORDER_STATUSES.length}
      </p>
      <Link
        href={`/order/${order.id}`}
        className="mt-2 inline-flex min-h-11 items-center font-bold text-brand underline underline-offset-2"
      >
        Open order tracker
      </Link>
    </section>
  );
}
