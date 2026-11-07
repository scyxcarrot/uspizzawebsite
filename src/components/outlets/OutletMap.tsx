"use client";

// A small map of the demo outlets: Leaflet with OpenStreetMap tiles, loaded
// only in the browser, with no API key. It shows the outlets, the customer's
// pin (if shared or an area was picked) and the demo delivery radius.
// If Leaflet or the tiles fail to load, the picker still works without it.
// On phones, one-finger dragging is off so the map never traps page scrolling.

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { OUTLETS, type Outlet } from "@/data/outlets";
import { DELIVERY_RADIUS_KM, type LatLng } from "@/lib/outlets";

type Props = {
  origin: (LatLng & { label: string }) | null;
  /** Outlet to draw the delivery radius around (delivery mode). */
  radiusOutlet?: Outlet;
};

const KL_CENTRE: [number, number] = [3.12, 101.66];

export default function OutletMap({ origin, radiusOutlet }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    (async () => {
      try {
        const L = await import("leaflet");
        if (cancelled || !el.current) return;
        const touch = window.matchMedia("(pointer: coarse)").matches;
        map = L.map(el.current, {
          center: origin ? [origin.lat, origin.lng] : KL_CENTRE,
          zoom: 11,
          scrollWheelZoom: false,
          dragging: !touch,
          attributionControl: true,
        });
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
        }).addTo(map);

        const points: [number, number][] = [];
        for (const o of OUTLETS) {
          L.circleMarker([o.lat, o.lng], { radius: 8, color: "#9e0c24", weight: 2, fillColor: "#c8102e", fillOpacity: 0.9 })
            .bindTooltip(o.name)
            .addTo(map);
          points.push([o.lat, o.lng]);
        }
        if (radiusOutlet) {
          L.circle([radiusOutlet.lat, radiusOutlet.lng], {
            radius: DELIVERY_RADIUS_KM * 1000,
            color: "#2f6b3f",
            weight: 2,
            fillOpacity: 0.08,
          })
            .bindTooltip(`${DELIVERY_RADIUS_KM} km delivery radius`)
            .addTo(map);
        }
        if (origin) {
          L.circleMarker([origin.lat, origin.lng], { radius: 9, color: "#ffffff", weight: 3, fillColor: "#2a2321", fillOpacity: 1 })
            .bindTooltip(origin.label === "your location" ? "You" : origin.label)
            .addTo(map);
          points.push([origin.lat, origin.lng]);
        }
        map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 13 });
      } catch (err) {
        console.warn("[map] could not load the map", err);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [origin, radiusOutlet]);

  if (failed) {
    return (
      <p className="rounded-xl bg-crust px-3 py-2 text-sm text-ink-soft" data-testid="outlet-map-error">
        The map couldn&apos;t load. You can still choose an outlet from the list.
      </p>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <div
        ref={el}
        className="h-60 w-full bg-crust"
        role="region"
        aria-label="Map of our outlets. The list gives the same information."
        data-testid="outlet-map"
      />
      <p className="bg-white px-3 py-1.5 text-xs text-ink-soft">
        Red: outlets. Dark: {origin ? (origin.label === "your location" ? "you" : origin.label) : "your location, once shared"}.
        {radiusOutlet ? ` Green: ${DELIVERY_RADIUS_KM} km delivery radius.` : ""} On phones, use two fingers to move the map.
      </p>
    </div>
  );
}
