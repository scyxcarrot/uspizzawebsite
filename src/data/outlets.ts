// Demo outlets. These are NOT real US Pizza stores: the names, addresses
// and hours are invented for this demo. Each one is placed at the
// approximate centre of a real Klang Valley area so that distances and
// "nearest outlet" behave realistically.
//
// US Pizza's terms of use do not allow automated collection of their outlet
// data, so none of it is used here. A real version would use US Pizza's
// official outlet data or API, with permission.

export type DemoHours = {
  /** Minutes after midnight, Malaysia time. */
  opensAt: number;
  /** Minutes after midnight. If smaller than opensAt, the outlet closes after midnight. */
  closesAt: number;
};

export type Outlet = {
  id: string;
  name: string;
  /** The real area the demo outlet is placed in. */
  area: string;
  address: string;
  lat: number;
  lng: number;
  /** Invented demo hours, the same every day. */
  hours: DemoHours;
};

const h = (hh: number, mm = 0) => hh * 60 + mm;

export const OUTLETS: Outlet[] = [
  {
    id: "damansara-heights",
    name: "Damansara Heights Outlet",
    area: "Damansara Heights",
    address: "Damansara Heights, Kuala Lumpur",
    lat: 3.152,
    lng: 101.661,
    hours: { opensAt: h(10, 30), closesAt: h(23) },
  },
  {
    id: "bangsar",
    name: "Bangsar Outlet",
    area: "Bangsar",
    address: "Bangsar, Kuala Lumpur",
    lat: 3.1307,
    lng: 101.671,
    hours: { opensAt: h(10, 30), closesAt: h(1) },
  },
  {
    id: "petaling-jaya",
    name: "Petaling Jaya Outlet",
    area: "Petaling Jaya",
    address: "SS2, Petaling Jaya, Selangor",
    lat: 3.1185,
    lng: 101.623,
    hours: { opensAt: h(10), closesAt: h(22, 30) },
  },
  {
    id: "subang-jaya",
    name: "Subang Jaya Outlet",
    area: "Subang Jaya",
    address: "SS15, Subang Jaya, Selangor",
    lat: 3.078,
    lng: 101.587,
    hours: { opensAt: h(10, 30), closesAt: h(23, 30) },
  },
  {
    id: "cheras",
    name: "Cheras Outlet",
    area: "Cheras",
    address: "Taman Connaught, Cheras, Kuala Lumpur",
    lat: 3.08,
    lng: 101.739,
    hours: { opensAt: h(11), closesAt: h(23) },
  },
  {
    id: "klcc",
    name: "KLCC Outlet",
    area: "KLCC",
    address: "KLCC, Kuala Lumpur",
    lat: 3.157,
    lng: 101.712,
    hours: { opensAt: h(10), closesAt: h(22) },
  },
];

/**
 * Areas a customer can pick instead of sharing their location. Approximate
 * area centres (public geography, not store data). Klang and Putrajaya are
 * outside every demo outlet's delivery radius.
 */
export const AREAS: { name: string; lat: number; lng: number }[] = [
  { name: "Ampang", lat: 3.15, lng: 101.76 },
  { name: "Bangsar", lat: 3.1307, lng: 101.671 },
  { name: "Bukit Bintang", lat: 3.146, lng: 101.711 },
  { name: "Cheras", lat: 3.08, lng: 101.739 },
  { name: "Damansara Heights", lat: 3.152, lng: 101.661 },
  { name: "Kepong", lat: 3.21, lng: 101.636 },
  { name: "Klang", lat: 3.044, lng: 101.446 },
  { name: "KLCC", lat: 3.157, lng: 101.712 },
  { name: "Mid Valley", lat: 3.118, lng: 101.677 },
  { name: "Mont Kiara", lat: 3.17, lng: 101.651 },
  { name: "Petaling Jaya", lat: 3.1185, lng: 101.623 },
  { name: "Puchong", lat: 3.023, lng: 101.618 },
  { name: "Putrajaya", lat: 2.926, lng: 101.696 },
  { name: "Sri Petaling", lat: 3.067, lng: 101.688 },
  { name: "Subang Jaya", lat: 3.078, lng: 101.587 },
];

export const OUTLETS_NOTE =
  "Demo outlets in real Klang Valley areas. The names, addresses and hours are invented, and this demo does not send orders anywhere.";

/** Official Google Maps search URL (no API key) for the real outlets. */
export const REAL_OUTLETS_MAP_URL = "https://www.google.com/maps/search/?api=1&query=US+Pizza+Kuala+Lumpur";

export function findOutlet(id: string): Outlet | undefined {
  return OUTLETS.find((o) => o.id === id);
}
