// Outlet rules: distance, nearest outlet, delivery radius, opening hours and
// time estimates. Plain code, used by the website and the chatbot.

import { AREAS, OUTLETS, type Outlet } from "@/data/outlets";

export type LatLng = { lat: number; lng: number };

/** Demo assumption: an outlet delivers within this straight-line distance. */
export const DELIVERY_RADIUS_KM = 8;
/** Kitchen time before an order is ready, in minutes. */
export const PREP_MINUTES = { min: 15, max: 20 } as const;
/** Average city driving speed for delivery estimates. */
export const CITY_SPEED_KMH = 25;

/** Straight-line distance in km (haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** True for a point roughly inside Peninsular Malaysia or Borneo (rejects nonsense input). */
export function isPlausibleMalaysiaPoint(p: LatLng): boolean {
  return Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat > 0.5 && p.lat < 7.5 && p.lng > 99 && p.lng < 120;
}

export type OutletDistance = { outlet: Outlet; distanceKm: number };

export function outletsByDistance(from: LatLng, outlets: Outlet[] = OUTLETS): OutletDistance[] {
  return outlets
    .map((outlet) => ({ outlet, distanceKm: distanceKm(from, outlet) }))
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/** The nearest outlet that delivers to this point, or undefined if none is within the radius. */
export function nearestDeliveryOutlet(from: LatLng, radiusKm = DELIVERY_RADIUS_KM): OutletDistance | undefined {
  const nearest = outletsByDistance(from)[0];
  return nearest && nearest.distanceKm <= radiusKm ? nearest : undefined;
}

/** Find a named area or outlet ("Bangsar", "klcc", "Cheras Outlet"). */
export function findArea(name: string): { name: string; lat: number; lng: number } | undefined {
  const q = name.toLowerCase().replace(/demo outlet\s*[–-]?\s*/, "").replace(/\boutlet\b/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!q) return undefined;
  const exact = AREAS.find((a) => a.name.toLowerCase() === q);
  if (exact) return exact;
  const partial = AREAS.filter((a) => a.name.toLowerCase().includes(q) || q.includes(a.name.toLowerCase()));
  return partial.length === 1 ? partial[0] : undefined;
}

// ---------- Opening hours (Malaysia time, UTC+8, no daylight saving) ----------

export function malaysiaMinutes(now: Date): number {
  return (now.getUTCHours() * 60 + now.getUTCMinutes() + 8 * 60) % (24 * 60);
}

/** True while a temporary closure set from the admin page is in force. */
export function isTemporarilyClosed(outlet: Outlet, now: Date): boolean {
  if (!outlet.closedUntil) return false;
  const until = Date.parse(outlet.closedUntil);
  return Number.isFinite(until) && now.getTime() < until;
}

/** Open now: inside its daily hours and not temporarily closed. */
export function isOpenAt(outlet: Outlet, now: Date): boolean {
  if (isTemporarilyClosed(outlet, now)) return false;
  const m = malaysiaMinutes(now);
  const { opensAt, closesAt } = outlet.hours;
  return opensAt < closesAt ? m >= opensAt && m < closesAt : m >= opensAt || m < closesAt;
}

export function formatClock(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h24 < 12 ? "am" : "pm";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Format an ISO time as Malaysia time, e.g. "7 Nov, 6:00 pm". */
export function formatMalaysiaDateTime(iso: string): string {
  const d = new Date(Date.parse(iso) + 8 * 3600_000);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]}, ${formatClock(d.getUTCHours() * 60 + d.getUTCMinutes())}`;
}

/** Why an outlet is closed now, for the customer and the chatbot. */
export function closedMessage(outlet: Outlet, now: Date): string {
  if (isTemporarilyClosed(outlet, now)) {
    const reason = outlet.closedReason ? ` (${outlet.closedReason})` : "";
    return `${outlet.name} is temporarily closed until ${formatMalaysiaDateTime(outlet.closedUntil!)}${reason}.`;
  }
  return `${outlet.name} is closed right now. It opens at ${formatClock(outlet.hours.opensAt)}.`;
}

/** Opening and closing at the same time means open 24 hours. */
export function isOpen24Hours(outlet: Outlet): boolean {
  return outlet.hours.opensAt === outlet.hours.closesAt;
}

export function hoursLabel(outlet: Outlet): string {
  if (isOpen24Hours(outlet)) return "Open 24 hours";
  return `${formatClock(outlet.hours.opensAt)} – ${formatClock(outlet.hours.closesAt)} daily`;
}

// ---------- Estimates ----------

export type Estimate = { minMinutes: number; maxMinutes: number; label: string };

const roundTo5 = (n: number) => Math.round(n / 5) * 5;

/** Pickup: kitchen time only. */
export function pickupEstimate(): Estimate {
  return { minMinutes: PREP_MINUTES.min, maxMinutes: PREP_MINUTES.max, label: `Ready in about ${PREP_MINUTES.min}–${PREP_MINUTES.max} min (estimate)` };
}

/** Delivery: kitchen time plus driving at an average city speed, with extra margin for traffic. */
export function deliveryEstimate(km: number): Estimate {
  const drive = (Math.max(0, km) / CITY_SPEED_KMH) * 60;
  const minMinutes = roundTo5(PREP_MINUTES.min + drive);
  const maxMinutes = Math.max(minMinutes + 10, roundTo5(PREP_MINUTES.max + drive * 1.5 + 5));
  return { minMinutes, maxMinutes, label: `About ${minMinutes}–${maxMinutes} min (estimate)` };
}

export function formatKm(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}
