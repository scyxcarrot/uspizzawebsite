import { describe, expect, it } from "vitest";
import { AREAS, OUTLETS, findOutlet } from "@/data/outlets";
import {
  DELIVERY_RADIUS_KM,
  deliveryEstimate,
  distanceKm,
  findArea,
  formatClock,
  isOpenAt,
  isPlausibleMalaysiaPoint,
  malaysiaMinutes,
  nearestDeliveryOutlet,
  outletsByDistance,
  pickupEstimate,
} from "@/lib/outlets";

const area = (name: string) => AREAS.find((a) => a.name === name)!;
/** A Date at this Malaysia time on 7 Nov 2026. */
const myt = (hh: number, mm = 0) => new Date(Date.UTC(2026, 10, 7, hh - 8, mm));

describe("distance", () => {
  it("is zero for the same point and symmetric", () => {
    const a = { lat: 3.15, lng: 101.7 };
    expect(distanceKm(a, a)).toBe(0);
    const b = { lat: 3.1, lng: 101.6 };
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 10);
  });

  it("matches known distances", () => {
    // One degree of latitude is about 111.2 km.
    expect(distanceKm({ lat: 3, lng: 101.7 }, { lat: 4, lng: 101.7 })).toBeCloseTo(111.2, 0);
    // KLCC to Bangsar is roughly 5 km in a straight line.
    const km = distanceKm(findOutlet("klcc")!, findOutlet("bangsar")!);
    expect(km).toBeGreaterThan(4);
    expect(km).toBeLessThan(6);
  });

  it("rejects points outside Malaysia", () => {
    expect(isPlausibleMalaysiaPoint({ lat: 3.1, lng: 101.6 })).toBe(true);
    expect(isPlausibleMalaysiaPoint({ lat: 51.5, lng: -0.1 })).toBe(false);
    expect(isPlausibleMalaysiaPoint({ lat: Number.NaN, lng: 101 })).toBe(false);
  });
});

describe("nearest outlet and delivery radius", () => {
  it("sorts outlets nearest first", () => {
    const list = outletsByDistance(area("Mid Valley"));
    expect(list).toHaveLength(OUTLETS.length);
    expect(list[0]!.outlet.id).toBe("bangsar");
    for (let i = 1; i < list.length; i++) expect(list[i]!.distanceKm).toBeGreaterThanOrEqual(list[i - 1]!.distanceKm);
  });

  it("assigns the nearest outlet within the radius", () => {
    expect(nearestDeliveryOutlet(area("Bukit Bintang"))?.outlet.id).toBe("klcc");
    expect(nearestDeliveryOutlet(area("Puchong"))?.outlet.id).toBe("subang-jaya");
    expect(nearestDeliveryOutlet(area("Bangsar"))?.distanceKm).toBe(0);
  });

  it("finds none when every outlet is farther than the radius", () => {
    for (const name of ["Klang", "Putrajaya"]) {
      expect(nearestDeliveryOutlet(area(name))).toBeUndefined();
      expect(outletsByDistance(area(name))[0]!.distanceKm).toBeGreaterThan(DELIVERY_RADIUS_KM);
    }
  });

  it("treats the radius edge as inside", () => {
    const outlet = findOutlet("klcc")!;
    const edge = { lat: outlet.lat + DELIVERY_RADIUS_KM / 111.2 - 0.0001, lng: outlet.lng };
    expect(nearestDeliveryOutlet(edge, DELIVERY_RADIUS_KM)).toBeDefined();
  });

  it("finds areas and outlets by name", () => {
    expect(findArea("bangsar")?.name).toBe("Bangsar");
    expect(findArea("Demo Outlet – KLCC")?.name).toBe("KLCC");
    expect(findArea("near Mont Kiara please")?.name).toBe("Mont Kiara");
    expect(findArea("Atlantis")).toBeUndefined();
  });
});

describe("opening hours (Malaysia time)", () => {
  it("converts to Malaysia minutes", () => {
    expect(malaysiaMinutes(myt(10, 30))).toBe(630);
    expect(malaysiaMinutes(myt(0, 15))).toBe(15);
  });

  it("is open between opening and closing", () => {
    const klcc = findOutlet("klcc")!; // 10:00 am – 10:00 pm
    expect(isOpenAt(klcc, myt(9, 59))).toBe(false);
    expect(isOpenAt(klcc, myt(10, 0))).toBe(true);
    expect(isOpenAt(klcc, myt(21, 59))).toBe(true);
    expect(isOpenAt(klcc, myt(22, 0))).toBe(false);
  });

  it("handles closing after midnight", () => {
    const bangsar = findOutlet("bangsar")!; // 10:30 am – 1:00 am
    expect(isOpenAt(bangsar, myt(23, 30))).toBe(true);
    expect(isOpenAt(bangsar, myt(0, 30))).toBe(true);
    expect(isOpenAt(bangsar, myt(1, 0))).toBe(false);
    expect(isOpenAt(bangsar, myt(9, 0))).toBe(false);
  });

  it("formats times", () => {
    expect(formatClock(0)).toBe("12:00 am");
    expect(formatClock(630)).toBe("10:30 am");
    expect(formatClock(12 * 60)).toBe("12:00 pm");
    expect(formatClock(22 * 60 + 30)).toBe("10:30 pm");
  });
});

describe("estimates", () => {
  it("pickup is kitchen time only", () => {
    expect(pickupEstimate()).toMatchObject({ minMinutes: 15, maxMinutes: 20 });
    expect(pickupEstimate().label).toMatch(/estimate/);
  });

  it("delivery adds driving time and grows with distance", () => {
    const near = deliveryEstimate(0);
    const far = deliveryEstimate(8);
    expect(near.minMinutes).toBe(15);
    expect(far.minMinutes).toBeGreaterThan(near.minMinutes);
    expect(far.maxMinutes).toBeGreaterThan(far.minMinutes);
    // 8 km at 25 km/h is about 19 minutes of driving.
    expect(far.minMinutes).toBe(35);
    expect(far.label).toBe(`About ${far.minMinutes}–${far.maxMinutes} min (estimate)`);
  });

  it("always gives a range of at least 10 minutes, in steps of 5", () => {
    for (const km of [0, 0.5, 1, 2.3, 5, 7.9]) {
      const e = deliveryEstimate(km);
      expect(e.maxMinutes - e.minMinutes).toBeGreaterThanOrEqual(10);
      expect(e.minMinutes % 5).toBe(0);
    }
  });
});
