"use client";

// The strip under the header. Before an outlet is chosen it asks "Delivery
// or pickup?" without blocking the menu; afterwards it shows the choice
// ("Delivery from: Bangsar ▾") and opens the picker to change it.

import { findOutlet } from "@/data/outlets";
import { deliveryEstimate, formatKm, pickupEstimate } from "@/lib/outlets";
import { useAppState } from "@/components/AppStateProvider";
import { StoreIcon, TruckIcon } from "@/components/Icons";

export function OutletBar() {
  const { ready, outlet, fulfilment, openOutletPicker } = useAppState();
  if (!ready) return <div className="h-12 border-b border-line bg-white" aria-hidden />;

  const chosen = outlet ? findOutlet(outlet.outletId) : undefined;
  if (!chosen) {
    return (
      <div className="border-b border-line bg-gold-tint" data-testid="outlet-bar">
        <div className="mx-auto flex min-h-12 max-w-6xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 sm:px-6">
          <p className="font-semibold">Delivery or pickup?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => openOutletPicker("delivery")}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ink px-3.5 text-sm font-bold text-white"
              data-testid="outlet-start-delivery"
            >
              <TruckIcon className="size-4" /> Delivery
            </button>
            <button
              type="button"
              onClick={() => openOutletPicker("pickup")}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 border-ink bg-white px-3.5 text-sm font-bold"
              data-testid="outlet-start-pickup"
            >
              <StoreIcon className="size-4" /> Pickup
            </button>
          </div>
        </div>
      </div>
    );
  }

  const estimate =
    fulfilment === "pickup" ? pickupEstimate() : outlet?.distanceKm !== undefined ? deliveryEstimate(outlet.distanceKm) : undefined;
  return (
    <div className="border-b border-line bg-white" data-testid="outlet-bar">
      <div className="mx-auto flex min-h-12 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <button
          type="button"
          onClick={() => openOutletPicker()}
          className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-full bg-crust px-3.5 text-sm hover:bg-line"
          data-testid="outlet-chip"
          aria-label={`${fulfilment === "pickup" ? "Pickup at" : "Delivery from"} ${chosen.name}. Change`}
        >
          {fulfilment === "pickup" ? <StoreIcon className="size-4 shrink-0" /> : <TruckIcon className="size-4 shrink-0" />}
          <span className="truncate">
            {fulfilment === "pickup" ? "Pickup at: " : "Delivery from: "}
            <span className="font-bold">{chosen.area}</span>
          </span>
          <span aria-hidden>▾</span>
        </button>
        {estimate && (
          <p className="hidden truncate text-sm text-ink-soft sm:block">
            {outlet?.distanceKm !== undefined && `${formatKm(outlet.distanceKm)} · `}
            {estimate.label}
          </p>
        )}
      </div>
    </div>
  );
}
