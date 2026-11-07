// The live catalogue: menu items and outlets as currently set in the database.
//
// Every part of the site (menu, cart, pricing, planner, checkout, chatbot
// tools) reads the menu through `MENU` / `findMenuItem` and outlets through
// `OUTLETS` / `findOutlet`. `applyCatalog` replaces the contents of those
// arrays in place, so they all read the same source without each needing a
// database call. The original data in src/data is the seed and the fallback.
//
// This file has no database code, so it is safe in the browser. The server
// side lives in src/lib/db/.

import { z } from "zod";
import { ALLERGENS, CATEGORIES, DIETARY_TAGS, MENU, ORIGINAL_MENU, type MenuItem } from "@/data/menu";
import { ORIGINAL_OUTLETS, OUTLETS, type Outlet } from "@/data/outlets";

export type Catalog = { menu: MenuItem[]; outlets: Outlet[] };

// ---------- Validation of stored data (a bad row never reaches the site) ----------

const sen = z.number().int().min(0).max(1_000_000);
const baseItem = {
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  category: z.enum(CATEGORIES.map((c) => c.id) as [MenuItem["category"], ...MenuItem["category"][]]),
  description: z.string().max(400),
  image: z.string().max(200),
  tags: z.array(z.enum(DIETARY_TAGS)),
  allergens: z.array(z.enum(ALLERGENS)),
  soldOut: z.boolean().optional(),
};
export const menuItemSchema = z.discriminatedUnion("kind", [
  z.object({ ...baseItem, kind: z.literal("pizza"), priceBySize: z.object({ regular: sen, large: sen }) }),
  z.object({ ...baseItem, kind: z.literal("simple"), price: sen }),
]);

const minuteOfDay = z.number().int().min(0).max(24 * 60 - 1);
export const outletSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  area: z.string().min(1).max(80),
  address: z.string().max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  hours: z.object({ opensAt: minuteOfDay, closesAt: minuteOfDay }),
  closedUntil: z.string().max(40).optional(),
  closedReason: z.string().max(120).optional(),
});

export const catalogSchema = z.object({
  menu: z.array(menuItemSchema).min(1).max(200),
  outlets: z.array(outletSchema).min(1).max(50),
});

// ---------- Live catalogue ----------

export function originalCatalog(): Catalog {
  return { menu: structuredClone([...ORIGINAL_MENU]), outlets: structuredClone([...ORIGINAL_OUTLETS]) };
}

export function currentCatalog(): Catalog {
  return { menu: structuredClone(MENU), outlets: structuredClone(OUTLETS) };
}

/** A stable fingerprint, so the browser can tell when anything changed. */
export function catalogVersion(c: Catalog): string {
  const s = JSON.stringify(c);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36) + s.length.toString(36);
}

/**
 * Make `c` the live catalogue. Returns false (and changes nothing) if it is
 * not valid, so a broken row can't break the site.
 */
export function applyCatalog(c: unknown): boolean {
  const parsed = catalogSchema.safeParse(c);
  if (!parsed.success) return false;
  MENU.splice(0, MENU.length, ...(parsed.data.menu as MenuItem[]));
  OUTLETS.splice(0, OUTLETS.length, ...(parsed.data.outlets as Outlet[]));
  return true;
}

// ---------- Admin changes (validated with Zod on the server) ----------

const rmPrice = z
  .number({ error: "Enter a price in RM." })
  .min(0.5, "Prices must be at least RM 0.50.")
  .max(500, "Prices must be at most RM 500.00.")
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Use at most two decimal places.");

/** Price changes arrive in RM (as typed) and are stored in sen. */
export const itemChangeSchema = z
  .object({
    id: z.string().min(1).max(64),
    description: z.string().trim().min(10, "The description needs at least 10 characters.").max(300, "Keep the description under 300 characters.").optional(),
    priceRM: rmPrice.optional(),
    regularRM: rmPrice.optional(),
    largeRM: rmPrice.optional(),
    soldOut: z.boolean().optional(),
  })
  .strict();
export type ItemChange = z.infer<typeof itemChangeSchema>;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 10:30.");
export const outletChangeSchema = z
  .object({
    id: z.string().min(1).max(64),
    opensAt: hhmm.optional(),
    closesAt: hhmm.optional(),
    /** null clears the closure. */
    closure: z
      .object({
        hours: z.number().int("Use whole hours.").min(1, "A closure lasts at least 1 hour.").max(24 * 14, "A closure lasts at most 14 days."),
        reason: z.string().trim().max(120, "Keep the reason under 120 characters."),
      })
      .nullable()
      .optional(),
  })
  .strict();
export type OutletChange = z.infer<typeof outletChangeSchema>;

const toSen = (rm: number) => Math.round(rm * 100);
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export type ChangeResult<T> = { ok: true; value: T; summary: string } | { ok: false; error: string };

/** Apply a validated item change to a copy of the item. */
export function applyItemChange(item: MenuItem, change: ItemChange): ChangeResult<MenuItem> {
  const next = structuredClone(item);
  const parts: string[] = [];
  if (change.description !== undefined && change.description !== item.description) {
    next.description = change.description;
    parts.push("description");
  }
  if (next.kind === "pizza") {
    if (change.priceRM !== undefined) return { ok: false, error: "Pizzas have a Regular and a Large price." };
    if (change.regularRM !== undefined) next.priceBySize.regular = toSen(change.regularRM);
    if (change.largeRM !== undefined) next.priceBySize.large = toSen(change.largeRM);
    if (next.priceBySize.large < next.priceBySize.regular) return { ok: false, error: "The Large price can't be lower than the Regular price." };
    if (item.kind === "pizza" && (next.priceBySize.regular !== item.priceBySize.regular || next.priceBySize.large !== item.priceBySize.large)) {
      parts.push(`price ${item.priceBySize.regular}/${item.priceBySize.large} → ${next.priceBySize.regular}/${next.priceBySize.large} sen`);
    }
  } else {
    if (change.regularRM !== undefined || change.largeRM !== undefined) return { ok: false, error: "This item has a single price." };
    if (change.priceRM !== undefined) next.price = toSen(change.priceRM);
    if (item.kind === "simple" && next.price !== item.price) parts.push(`price ${item.price} → ${next.price} sen`);
  }
  if (change.soldOut !== undefined && change.soldOut !== !!item.soldOut) {
    if (change.soldOut) next.soldOut = true;
    else delete next.soldOut;
    parts.push(change.soldOut ? "marked sold out" : "back in stock");
  }
  if (parts.length === 0) return { ok: false, error: "Nothing changed." };
  return { ok: true, value: next, summary: `${item.name}: ${parts.join(", ")}` };
}

/** Apply a validated outlet change to a copy of the outlet. */
export function applyOutletChange(outlet: Outlet, change: OutletChange, now: Date = new Date()): ChangeResult<Outlet> {
  const next = structuredClone(outlet);
  const parts: string[] = [];
  if (change.opensAt !== undefined) next.hours.opensAt = toMinutes(change.opensAt);
  if (change.closesAt !== undefined) next.hours.closesAt = toMinutes(change.closesAt);
  // The same opening and closing time means open 24 hours (stored as 00:00–00:00).
  if (next.hours.opensAt === next.hours.closesAt) next.hours = { opensAt: 0, closesAt: 0 };
  if (next.hours.opensAt !== outlet.hours.opensAt || next.hours.closesAt !== outlet.hours.closesAt) {
    parts.push(next.hours.opensAt === next.hours.closesAt ? "open 24 hours" : `hours ${change.opensAt ?? "same"}–${change.closesAt ?? "same"}`);
  }
  if (change.closure === null && outlet.closedUntil) {
    delete next.closedUntil;
    delete next.closedReason;
    parts.push("reopened");
  } else if (change.closure) {
    next.closedUntil = new Date(now.getTime() + change.closure.hours * 3600_000).toISOString();
    if (change.closure.reason) next.closedReason = change.closure.reason;
    else delete next.closedReason;
    parts.push(`closed for ${change.closure.hours} h${change.closure.reason ? ` (${change.closure.reason})` : ""}`);
  }
  if (parts.length === 0) return { ok: false, error: "Nothing changed." };
  return { ok: true, value: next, summary: `${outlet.name}: ${parts.join(", ")}` };
}

export function zodMessage(err: z.ZodError): string {
  return err.issues[0]?.message ?? "That change isn't valid.";
}
