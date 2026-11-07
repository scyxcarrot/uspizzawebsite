"use client";

// Choose Delivery or Pickup and a demo outlet. Location is asked for only
// when the customer taps "Use my location", is kept in memory for this visit
// only, and is never saved or sent anywhere except a chat request.

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { AREAS, OUTLETS, OUTLETS_NOTE, REAL_OUTLETS_MAP_URL, type Outlet } from "@/data/outlets";
import {
  DELIVERY_RADIUS_KM,
  deliveryEstimate,
  formatKm,
  hoursLabel,
  isOpenAt,
  nearestDeliveryOutlet,
  outletsByDistance,
  pickupEstimate,
  type LatLng,
} from "@/lib/outlets";
import type { Fulfilment } from "@/lib/pricing";
import { useAppState } from "@/components/AppStateProvider";
import { CloseIcon, SearchIcon, StoreIcon, TruckIcon } from "@/components/Icons";
import { Modal } from "@/components/Modal";

type Origin = LatLng & { label: string };

// Client-only, loaded when the customer opens it. Without it the picker works as before.
const OutletMap = dynamic(() => import("@/components/outlets/OutletMap"), {
  ssr: false,
  loading: () => <div className="h-60 animate-pulse rounded-2xl bg-crust" aria-hidden />,
});

export function OutletPicker() {
  const { outletPicker, closeOutletPicker } = useAppState();
  return (
    <Modal open={outletPicker.open} onClose={closeOutletPicker} variant="center" labelledBy="outlet-picker-title" testId="outlet-picker">
      {outletPicker.open && <PickerBody initialMode={outletPicker.mode} onClose={closeOutletPicker} />}
    </Modal>
  );
}

function PickerBody({ initialMode, onClose }: { initialMode: Fulfilment; onClose: () => void }) {
  const { location, setLocation, chooseOutlet, showNotice } = useAppState();
  const [mode, setMode] = useState<Fulfilment>(initialMode);
  const [origin, setOrigin] = useState<Origin | null>(location ? { ...location, label: "your location" } : null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const radiusOutlet = mode === "delivery" && origin ? nearestDeliveryOutlet(origin)?.outlet : undefined;

  function useMyLocation() {
    setLocationError(null);
    if (!("geolocation" in navigator)) {
      setLocationError("This browser can't share your location. Pick your area instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(point); // memory only
        setOrigin({ ...point, label: "your location" });
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was denied. No problem: pick your area instead."
            : "We couldn't get your location. Pick your area instead.",
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  }

  function choose(outlet: Outlet, chosenMode: Fulfilment, distanceKm?: number) {
    chooseOutlet(
      { outletId: outlet.id, ...(distanceKm !== undefined ? { distanceKm } : {}), ...(origin && origin.label !== "your location" ? { areaLabel: origin.label } : {}) },
      chosenMode,
    );
    showNotice(chosenMode === "pickup" ? `Pickup at ${outlet.name}` : `Delivery from ${outlet.name}`);
    onClose();
  }

  return (
    <div className="flex h-full flex-col md:max-h-[88dvh]">
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-white px-5 py-3">
        <h2 id="outlet-picker-title" className="flex-1 text-xl font-extrabold">
          Delivery or pickup?
        </h2>
        <button type="button" onClick={onClose} className="grid size-11 place-items-center rounded-full hover:bg-crust" aria-label="Close">
          <CloseIcon />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-crust p-1" role="tablist" aria-label="Delivery or pickup">
          {(
            [
              { id: "delivery", label: "Delivery", Icon: TruckIcon },
              { id: "pickup", label: "Pickup", Icon: StoreIcon },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
              className={`flex min-h-12 items-center justify-center gap-2 rounded-xl font-semibold ${mode === id ? "bg-white shadow-card" : "text-ink-soft hover:text-ink"}`}
              data-testid={`picker-mode-${id}`}
            >
              <Icon /> {label}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-ink px-4 font-bold text-white hover:bg-black disabled:opacity-60"
            data-testid="use-my-location"
          >
            {locating ? "Finding you…" : origin?.label === "your location" ? "Location shared ✓ (tap to refresh)" : "Use my location"}
          </button>
          <p className="text-xs text-ink-soft">Your location stays in this browser tab. It is never saved on our server.</p>
          {locationError && (
            <p role="alert" className="rounded-xl bg-gold-tint px-3 py-2 text-sm" data-testid="location-error">
              {locationError}
            </p>
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowMap((v) => !v)}
            aria-expanded={showMap}
            className="inline-flex min-h-11 items-center gap-1 rounded-full px-1 font-semibold text-brand underline underline-offset-2"
            data-testid="toggle-map"
          >
            {showMap ? "Hide map" : "Show map"}
          </button>
          {showMap && <OutletMap origin={origin} radiusOutlet={radiusOutlet} />}
        </div>

        {mode === "delivery" ? (
          <DeliveryPanel origin={origin} setOrigin={setOrigin} onChoose={(o, km) => choose(o, "delivery", km)} onPickup={() => setMode("pickup")} />
        ) : (
          <PickupPanel origin={origin} onChoose={(o, km) => choose(o, "pickup", km)} />
        )}

        <div className="space-y-1 rounded-xl border border-line bg-white px-3 py-2.5 text-sm" data-testid="outlet-disclaimer">
          <p className="text-ink-soft">{OUTLETS_NOTE}</p>
          <p>
            <a
              href={REAL_OUTLETS_MAP_URL}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex min-h-11 items-center font-semibold text-brand underline underline-offset-2"
              data-testid="real-outlets-link"
            >
              See real US Pizza outlets on Google Maps<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </p>
          <p className="text-xs text-ink-soft">Real outlets from Google Maps. This demo does not take orders for them.</p>
        </div>
      </div>
    </div>
  );
}

function AreaSearch({ onPick, selected }: { onPick: (o: Origin) => void; selected?: string }) {
  const [query, setQuery] = useState("");
  const matches = AREAS.filter((a) => a.name.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <div>
      <label htmlFor="area-search" className="mb-1 block font-semibold">
        Or pick your area
      </label>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-soft" />
        <input
          id="area-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search areas, e.g. Bangsar"
          className="min-h-12 w-full rounded-xl border-2 border-line bg-white pl-10 pr-3 text-base focus:border-ink"
          data-testid="area-search"
        />
      </div>
      <ul className="mt-2 flex flex-wrap gap-2" aria-label="Areas">
        {matches.map((a) => (
          <li key={a.name}>
            <button
              type="button"
              onClick={() => onPick({ lat: a.lat, lng: a.lng, label: a.name })}
              aria-pressed={selected === a.name}
              className="min-h-11 rounded-full border-2 border-line bg-white px-3.5 text-sm font-semibold hover:border-ink aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-white"
            >
              {a.name}
            </button>
          </li>
        ))}
        {matches.length === 0 && <li className="text-sm text-ink-soft">No area matches. Try another name.</li>}
      </ul>
    </div>
  );
}

function DeliveryPanel(props: {
  origin: Origin | null;
  setOrigin: (o: Origin) => void;
  onChoose: (outlet: Outlet, km: number) => void;
  onPickup: () => void;
}) {
  const { origin } = props;
  const nearest = origin ? nearestDeliveryOutlet(origin) : undefined;
  const closest = origin ? outletsByDistance(origin)[0] : undefined;
  return (
    <div className="space-y-4">
      {origin && nearest && (
        <div className="rounded-2xl border-2 border-basil bg-white p-4" data-testid="delivery-result">
          <p className="text-sm text-ink-soft">Nearest outlet to {origin.label}</p>
          <p className="font-display text-lg font-extrabold">{nearest.outlet.name}</p>
          <p className="text-sm">
            {formatKm(nearest.distanceKm)} away · {deliveryEstimate(nearest.distanceKm).label}
          </p>
          <button
            type="button"
            onClick={() => props.onChoose(nearest.outlet, nearest.distanceKm)}
            className="mt-3 flex min-h-12 w-full items-center justify-center rounded-full bg-brand px-4 font-bold text-white hover:bg-brand-dark"
            data-testid="choose-delivery-outlet"
          >
            Deliver from {nearest.outlet.area}
          </button>
        </div>
      )}
      {origin && !nearest && closest && (
        <div role="alert" className="rounded-2xl bg-gold-tint p-4" data-testid="delivery-out-of-range">
          <p className="font-bold">No demo outlet delivers to {origin.label}.</p>
          <p className="mt-1 text-sm">
            The nearest is {closest.outlet.name}, {formatKm(closest.distanceKm)} away. You can pick up from there instead.
          </p>
          <button
            type="button"
            onClick={props.onPickup}
            className="mt-3 flex min-h-11 w-full items-center justify-center rounded-full border-2 border-ink px-4 font-bold"
            data-testid="switch-to-pickup"
          >
            Choose pickup instead
          </button>
        </div>
      )}
      <AreaSearch onPick={props.setOrigin} selected={origin?.label} />
      <p className="text-xs text-ink-soft">
        Demo assumption: each outlet delivers within {DELIVERY_RADIUS_KM} km in a straight line. Times are estimates.
      </p>
    </div>
  );
}

function PickupPanel({ origin, onChoose }: { origin: Origin | null; onChoose: (outlet: Outlet, km?: number) => void }) {
  const [query, setQuery] = useState("");
  const now = useMinuteClock();
  const list = useMemo(() => {
    const base = origin ? outletsByDistance(origin) : OUTLETS.map((outlet) => ({ outlet, distanceKm: undefined as number | undefined }));
    const q = query.trim().toLowerCase();
    return q ? base.filter(({ outlet }) => `${outlet.name} ${outlet.area} ${outlet.address}`.toLowerCase().includes(q)) : base;
  }, [origin, query]);

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="outlet-search" className="mb-1 block font-semibold">
          Pickup outlets{origin ? `, nearest to ${origin.label} first` : ""}
        </label>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-soft" />
          <input
            id="outlet-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search outlets"
            className="min-h-12 w-full rounded-xl border-2 border-line bg-white pl-10 pr-3 text-base focus:border-ink"
            data-testid="outlet-search"
          />
        </div>
      </div>
      <ul className="space-y-2" data-testid="pickup-list">
        {list.map(({ outlet, distanceKm }) => {
          const open = isOpenAt(outlet, now);
          return (
            <li key={outlet.id} className="rounded-2xl border border-line bg-white p-3.5" data-testid="pickup-outlet" data-outlet-id={outlet.id}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="font-bold">{outlet.name}</p>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${open ? "bg-basil-tint text-basil" : "bg-crust text-ink-soft"}`}
                >
                  {open ? "Open now" : "Closed now"}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-ink-soft">{outlet.address}</p>
              <p className="mt-1 text-sm">
                {distanceKm !== undefined && <>{formatKm(distanceKm)} away · </>}
                {pickupEstimate().label}
              </p>
              <p className="text-xs text-ink-soft">{hoursLabel(outlet)}</p>
              <button
                type="button"
                onClick={() => onChoose(outlet, distanceKm)}
                className="mt-2 flex min-h-11 w-full items-center justify-center rounded-full border-2 border-ink px-4 font-bold hover:bg-ink hover:text-white"
                aria-label={`Pick up at ${outlet.name}`}
              >
                Pick up here
              </button>
            </li>
          );
        })}
        {list.length === 0 && <li className="text-sm text-ink-soft">No outlet matches your search.</li>}
      </ul>
    </div>
  );
}

/** The current time, refreshed every minute (for "Open now"). */
function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
