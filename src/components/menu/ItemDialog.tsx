"use client";

import Image from "next/image";
import { useState } from "react";
import { CRUSTS, DEFAULT_CRUST, SIZES, type CrustId, type MenuItem, type SizeId } from "@/data/menu";
import { formatRM } from "@/lib/money";
import { unitPriceSen } from "@/lib/pricing";
import { useAppState } from "@/components/AppStateProvider";
import { ChatIcon, CloseIcon } from "@/components/Icons";
import { Modal } from "@/components/Modal";
import { QuantityStepper } from "@/components/QuantityStepper";
import { AllergenList, TagList } from "@/components/menu/Tags";

type Props = { item: MenuItem | null; onClose: () => void };

export function ItemDialog({ item, onClose }: Props) {
  return (
    <Modal open={item !== null} onClose={onClose} variant="center" labelledBy="item-dialog-title" testId="item-dialog">
      {/* key resets the chosen options each time a different item opens */}
      {item && <ItemDialogBody key={item.id} item={item} onClose={onClose} />}
    </Modal>
  );
}

function ItemDialogBody({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  const { addItem, showNotice, setChatOpen, setFocusItemId } = useAppState();
  const [size, setSize] = useState<SizeId>("regular");
  const [crust, setCrust] = useState<CrustId>(DEFAULT_CRUST);
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const isPizza = item.kind === "pizza";
  const unit = isPizza ? unitPriceSen(item, size, crust) : unitPriceSen(item);
  const total = unit * quantity;

  function handleAdd() {
    const result = addItem(isPizza ? { itemId: item.id, quantity, size, crust } : { itemId: item.id, quantity });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    showNotice(result.message);
    onClose();
  }

  return (
    <div className="flex h-full flex-col md:max-h-[88dvh]">
      <div className="relative shrink-0">
        <Image
          src={item.image}
          alt=""
          width={400}
          height={300}
          className="h-48 w-full object-cover sm:h-56"
          priority
        />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 grid size-11 place-items-center rounded-full bg-white/95 text-ink shadow-card hover:bg-white"
          aria-label="Close"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4 pt-5">
        <h2 id="item-dialog-title" className="text-2xl font-extrabold">
          {item.name}
        </h2>
        <p className="mt-1.5 text-ink-soft">{item.description}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <TagList tags={item.tags} />
        </div>
        <AllergenList allergens={item.allergens} className="mt-3" />
        <button
          type="button"
          onClick={() => {
            setFocusItemId(item.id);
            onClose();
            setChatOpen(true);
          }}
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-line px-3.5 text-sm font-bold hover:border-ink"
          data-testid="ask-about-item"
        >
          <ChatIcon className="size-4" /> Ask the assistant about this
        </button>

        {isPizza && (
          <>
            <fieldset className="mt-5">
              <legend className="mb-2 font-display text-lg font-bold">Size</legend>
              <div className="grid grid-cols-2 gap-2">
                {SIZES.map((s) => (
                  <OptionRadio
                    key={s.id}
                    name="size"
                    checked={size === s.id}
                    onChange={() => setSize(s.id)}
                    label={s.name}
                    detail={formatRM(item.priceBySize[s.id])}
                  />
                ))}
              </div>
            </fieldset>

            <fieldset className="mt-5">
              <legend className="mb-2 font-display text-lg font-bold">Crust</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {CRUSTS.map((c) => (
                  <OptionRadio
                    key={c.id}
                    name="crust"
                    checked={crust === c.id}
                    onChange={() => setCrust(c.id)}
                    label={c.name}
                    detail={c.extraSen ? `+${formatRM(c.extraSen)}` : "No extra charge"}
                  />
                ))}
              </div>
            </fieldset>
          </>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-brand-tint px-3 py-2 text-sm font-medium text-brand-dark">
            {error}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-line bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {item.soldOut ? (
          <p className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-crust px-4 font-bold text-ink-soft" data-testid="dialog-sold-out">
            Sold out right now
          </p>
        ) : (
          <>
        <QuantityStepper value={quantity} onChange={setQuantity} label={item.name} />
        <button
          type="button"
          onClick={handleAdd}
          className="flex min-h-12 min-w-0 flex-1 items-center justify-between gap-2 whitespace-nowrap rounded-full bg-brand px-4 font-bold text-white hover:bg-brand-dark sm:px-5"
        >
          <span>
            Add<span className="max-[389px]:sr-only"> to cart</span>
          </span>
          <span className="tabular-nums" data-testid="dialog-total">
            {formatRM(total)}
          </span>
        </button>
          </>
        )}
      </div>
    </div>
  );
}

function OptionRadio(props: {
  name: string;
  checked: boolean;
  onChange: () => void;
  label: string;
  detail: string;
}) {
  return (
    <label
      className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-gold ${
        props.checked ? "border-brand bg-brand-tint" : "border-line bg-white hover:border-ink-soft"
      }`}
    >
      <input
        type="radio"
        name={props.name}
        checked={props.checked}
        onChange={props.onChange}
        className="size-5 accent-brand"
      />
      <span className="flex flex-col leading-tight">
        <span className="font-semibold">{props.label}</span>
        <span className="text-sm text-ink-soft">{props.detail}</span>
      </span>
    </label>
  );
}
