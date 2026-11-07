// Group order planner. Builds a basket for a group from a few simple,
// explainable rules. Plain code only: the AI model never chooses items or
// prices, it only passes the customer's requirements in and explains the
// result.
//
// The rule:
//   - Pizzas: one Large pizza for every 2.5 people, rounded up
//     (2 people: 1 pizza, 4 people: 2, 6 people: 3).
//   - Vegetarians: one Vegetarian pizza for every 2.5 vegetarians, rounded up.
//   - Sides: one side to share for every 3 people, rounded up (unless declined).
//   - Drinks: one drink each (unless declined).
//   - Dessert: only if asked for, one to share for every 3 people.
//   - Pick the cheapest suitable item first, without repeating an item
//     until every suitable item has been used once (so the group gets variety).
//
// Exclusions and dietary needs are never relaxed. If the budget is too low,
// the plan is made cheaper step by step, stopping as soon as it fits:
//   1. Mineral Water instead of Cola.   2. The cheapest suitable pizzas.
//   3. Fewer desserts.   4. No drinks.   5. Fewer sides.
//   6. Regular instead of Large pizzas.   7. Fewer pizzas (at least one,
//      and the vegetarians' pizza is removed last).
// Every change is reported. If even the smallest plan is over budget, the closest option
// is returned and clearly marked as over budget.

import { MENU, type MenuItem, type PizzaItem, type SizeId } from "@/data/menu";
import { STORE } from "@/data/store";
import { addToCart, type CartLine } from "@/lib/cart";
import { formatRM } from "@/lib/money";
import { priceCart, type CartSummary, type Fulfilment } from "@/lib/pricing";

export const MAX_PEOPLE = 20;
export const PEOPLE_PER_PIZZA = 2.5;
export const PEOPLE_PER_SHARED_ITEM = 3;

export const PLAN_RULE =
  "About one Large pizza for every 2 to 3 people (one per 2.5 people, rounded up), with a Vegetarian pizza for every 2 to 3 vegetarians, one side to share for every 3 people, and a drink each. The cheapest suitable items are chosen first, without repeats, for variety.";

export type PlanInput = {
  people: number;
  budgetSen?: number;
  vegetarians?: number;
  /** Tags, allergens or ingredients to leave out, e.g. "beef", "seafood", "nuts". */
  exclude?: string[];
  /** true: include a spicy pizza. false: no spicy items. Unset: no preference. */
  spicy?: boolean;
  sides?: boolean;
  drinks?: boolean;
  dessert?: boolean;
  fulfilment: Fulfilment;
};

export type Plan = {
  ok: boolean;
  people: number;
  lines: CartLine[];
  summary: CartSummary;
  perPersonSen: number;
  budgetSen?: number;
  withinBudget: boolean;
  overBudgetBySen: number;
  /** Changes made to fit the budget that keep to the rule (cheaper swaps). */
  adjustments: string[];
  /** Requests or portions that could not be fully met, and why. */
  relaxed: string[];
  freeDeliveryHint?: string;
  deliveryMinimumNote?: string;
};

// ---------- Matching exclusions ----------

const SYNONYMS: Record<string, string[]> = {
  meat: ["beef", "chicken"],
  fish: ["seafood"],
  shellfish: ["seafood"],
  prawn: ["seafood"],
  prawns: ["seafood"],
  shrimp: ["seafood"],
  nut: ["nuts"],
  peanut: ["nuts"],
  peanuts: ["nuts"],
  milk: ["dairy"],
  cheese: ["dairy"],
  lactose: ["dairy"],
  wheat: ["gluten"],
  eggs: ["egg"],
  spicy: ["spicy"],
  chilli: ["spicy"],
  chili: ["spicy"],
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Expand a customer's exclusion into the words to match ("no meat" -> beef, chicken). */
export function exclusionTerms(exclude: string[] = []): string[] {
  const terms = new Set<string>();
  for (const raw of exclude) {
    const t = norm(raw).replace(/^(no|without|not|non) /, "");
    if (!t) continue;
    terms.add(t);
    for (const s of SYNONYMS[t] ?? []) terms.add(s);
    if (t.endsWith("s") && t.length > 3) terms.add(t.slice(0, -1));
  }
  return [...terms];
}

/** True if the item has any excluded tag, allergen, or ingredient word. */
export function isExcluded(item: MenuItem, terms: string[]): boolean {
  if (terms.length === 0) return false;
  const words = new Set(norm(`${item.name} ${item.description} ${item.tags.join(" ")} ${item.allergens.join(" ")}`).split(" "));
  return terms.some((t) => (t.includes(" ") ? norm(`${item.name} ${item.description}`).includes(t) : words.has(t)));
}

// ---------- Building the basket ----------

type PizzaSlot = { veg: boolean; spicy: boolean; item: PizzaItem; size: SizeId };
type Draft = {
  pizzas: PizzaSlot[];
  sides: MenuItem[];
  drinks: MenuItem[];
  desserts: MenuItem[];
};

const price = (i: MenuItem) => (i.kind === "pizza" ? i.priceBySize.large : i.price);
const byPrice = (a: MenuItem, b: MenuItem) => price(a) - price(b) || a.name.localeCompare(b.name);

/** Take `count` items, cheapest first, without repeating until all are used. */
function pickVaried<T extends MenuItem>(options: T[], count: number, used = new Map<string, number>()): T[] {
  const picks: T[] = [];
  if (options.length === 0) return picks;
  for (let n = 0; n < count; n++) {
    const next = [...options].sort((a, b) => (used.get(a.id) ?? 0) - (used.get(b.id) ?? 0) || byPrice(a, b))[0]!;
    used.set(next.id, (used.get(next.id) ?? 0) + 1);
    picks.push(next);
  }
  return picks;
}

function toCart(d: Draft): CartLine[] {
  let cart: CartLine[] = [];
  const add = (input: Parameters<typeof addToCart>[1]) => {
    const r = addToCart(cart, input);
    if (!r.ok) throw new Error(`Planner built an invalid cart: ${r.error}`);
    cart = r.cart;
  };
  for (const p of d.pizzas) add({ itemId: p.item.id, quantity: 1, size: p.size, crust: "hand-tossed" });
  for (const i of [...d.sides, ...d.drinks, ...d.desserts]) add({ itemId: i.id, quantity: 1 });
  return cart;
}

const countLabel = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function planOrder(input: PlanInput): Plan {
  const people = Math.min(MAX_PEOPLE, Math.max(1, Math.floor(input.people)));
  const vegetarians = Math.min(people, Math.max(0, Math.floor(input.vegetarians ?? 0)));
  const terms = exclusionTerms([...(input.exclude ?? []), ...(input.spicy === false ? ["spicy"] : [])]);
  // Sold-out items are never planned.
  const allowed = MENU.filter((i) => !i.soldOut && !isExcluded(i, terms));
  const pizzas = allowed.filter((i): i is PizzaItem => i.kind === "pizza");
  const vegPizzas = pizzas.filter((p) => p.tags.includes("Vegetarian"));
  const nonVegPizzas = pizzas.filter((p) => !p.tags.includes("Vegetarian"));
  const spicyPizzas = pizzas.filter((p) => p.tags.includes("Spicy"));
  const sideOptions = allowed.filter((i) => i.category === "sides");
  const drinkOptions = allowed.filter((i) => i.category === "drinks");
  const dessertOptions = allowed.filter((i) => i.category === "desserts");
  const relaxed: string[] = [];
  const adjustments: string[] = [];

  // Pizzas
  const pizzaCount = Math.ceil(people / PEOPLE_PER_PIZZA);
  let vegCount = vegetarians > 0 ? Math.min(pizzaCount, Math.ceil(vegetarians / PEOPLE_PER_PIZZA)) : 0;
  if (vegCount > 0 && vegPizzas.length === 0) {
    relaxed.push("No vegetarian pizza fits the other exclusions, so the vegetarians' pizza was left out.");
    vegCount = 0;
  }
  const slots: PizzaSlot[] = [];
  const used = new Map<string, number>();
  for (const item of pickVaried(vegPizzas, vegCount, used)) slots.push({ veg: true, spicy: false, item, size: "large" });
  let otherCount = pizzaCount - vegCount;
  if (input.spicy === true && otherCount > 0) {
    const spicyOptions = vegetarians === people ? spicyPizzas.filter((p) => p.tags.includes("Vegetarian")) : spicyPizzas;
    const spicy = [...spicyOptions].sort(byPrice)[0];
    if (spicy) {
      slots.push({ veg: spicy.tags.includes("Vegetarian"), spicy: true, item: spicy, size: "large" });
      used.set(spicy.id, (used.get(spicy.id) ?? 0) + 1);
      otherCount--;
    } else {
      relaxed.push("No spicy pizza fits the other requirements, so the plan has no spicy pizza.");
    }
  }
  // Everyone vegetarian: all pizzas vegetarian. Otherwise prefer non-vegetarian for variety.
  const otherOptions = vegetarians === people ? vegPizzas : nonVegPizzas.length > 0 ? nonVegPizzas : vegPizzas;
  for (const item of pickVaried(otherOptions, otherCount, used)) {
    slots.push({ veg: item.tags.includes("Vegetarian"), spicy: false, item, size: "large" });
  }
  if (pizzas.length === 0) relaxed.push("No pizza on the menu fits these exclusions, so the plan has no pizza.");

  // Sides, drinks, dessert
  const sideCount = input.sides === false ? 0 : Math.ceil(people / PEOPLE_PER_SHARED_ITEM);
  const dessertCount = input.dessert ? Math.ceil(people / PEOPLE_PER_SHARED_ITEM) : 0;
  const drinkCount = input.drinks === false ? 0 : people;
  if (sideCount > 0 && sideOptions.length === 0) relaxed.push("No side fits these exclusions, so the plan has no sides.");
  if (dessertCount > 0 && dessertOptions.length === 0) relaxed.push("No dessert fits these exclusions, so the plan has no dessert.");
  const cola = drinkOptions.find((d) => d.id === "cola");
  const defaultDrink = cola ?? [...drinkOptions].sort(byPrice)[0];
  if (drinkCount > 0 && !defaultDrink) relaxed.push("No drink fits these exclusions, so the plan has no drinks.");

  const draft: Draft = {
    pizzas: slots,
    sides: pickVaried(sideOptions, sideCount),
    drinks: defaultDrink ? Array.from({ length: drinkCount }, () => defaultDrink) : [],
    desserts: pickVaried(dessertOptions, dessertCount),
  };

  const total = (d: Draft) => priceCart(toCart(d), input.fulfilment).totalSen;
  const budget = input.budgetSen;
  const fits = (d: Draft) => budget === undefined || total(d) <= budget;

  if (!fits(draft)) {
    // Step 1: cheapest drink.
    const cheapestDrink = [...drinkOptions].sort(byPrice)[0];
    if (cheapestDrink && draft.drinks.length && draft.drinks[0]!.id !== cheapestDrink.id) {
      draft.drinks = draft.drinks.map(() => cheapestDrink);
      adjustments.push(`Drinks changed to ${cheapestDrink.name} (${formatRM(price(cheapestDrink))} each) to fit the budget.`);
    }
  }
  if (!fits(draft)) {
    // Step 2: cheapest pizza for each slot (vegetarian slots stay vegetarian).
    const before = draft.pizzas.map((p) => p.item.id).join();
    const cheapestVeg = [...vegPizzas].sort(byPrice)[0];
    const cheapestOther = [...otherOptions].sort(byPrice)[0];
    draft.pizzas = draft.pizzas.map((p) => {
      const cheaper = p.veg ? cheapestVeg : cheapestOther;
      return cheaper && price(cheaper) < price(p.item) ? { ...p, item: cheaper as PizzaItem, spicy: false } : p;
    });
    if (draft.pizzas.map((p) => p.item.id).join() !== before) {
      adjustments.push("Cheaper pizzas chosen to fit the budget.");
      if (input.spicy === true && !draft.pizzas.some((p) => p.item.tags.includes("Spicy"))) {
        relaxed.push("The spicy pizza was swapped for a cheaper one to fit the budget.");
      }
    }
  }
  const removeOneByOne = (key: "desserts" | "sides", label: string, unit: string) => {
    const startCount = draft[key].length;
    while (!fits(draft) && draft[key].length > 0) draft[key] = draft[key].slice(0, -1);
    if (draft[key].length < startCount) {
      relaxed.push(
        draft[key].length === 0
          ? `${label} left out to fit the budget.`
          : `${countLabel(draft[key].length, unit)} instead of ${startCount}, to fit the budget.`,
      );
    }
  };
  removeOneByOne("desserts", "Dessert", "dessert");
  // Drinks are all or nothing: a drink for only some of the group would be odd.
  if (!fits(draft) && draft.drinks.length > 0) {
    draft.drinks = [];
    relaxed.push("Drinks left out to fit the budget.");
    // The earlier drink swap no longer applies.
    const swap = adjustments.findIndex((a) => a.startsWith("Drinks changed"));
    if (swap >= 0) adjustments.splice(swap, 1);
  }
  removeOneByOne("sides", "Sides", "side");
  if (!fits(draft)) {
    // Regular instead of Large, non-vegetarian pizzas first.
    let downsized = 0;
    const order = draft.pizzas.map((p, i) => ({ p, i })).sort((a, b) => Number(a.p.veg) - Number(b.p.veg));
    for (const { i } of order) {
      if (fits(draft)) break;
      draft.pizzas[i] = { ...draft.pizzas[i]!, size: "regular" };
      downsized++;
    }
    if (downsized) relaxed.push(`${countLabel(downsized, "pizza")} made Regular instead of Large, to fit the budget.`);
  }
  if (!fits(draft) && draft.pizzas.length > 1) {
    // Fewer pizzas, keeping at least one, and the vegetarians' pizza last.
    const startCount = draft.pizzas.length;
    while (!fits(draft) && draft.pizzas.length > 1) {
      const lastNonVeg = draft.pizzas.map((p) => p.veg).lastIndexOf(false);
      const removeAt = lastNonVeg >= 0 ? lastNonVeg : draft.pizzas.length - 1;
      draft.pizzas = draft.pizzas.filter((_, i) => i !== removeAt);
    }
    relaxed.push(
      `${countLabel(draft.pizzas.length, "pizza")} instead of ${startCount}: less than the usual portion for ${people} people, to fit the budget.`,
    );
  }

  const lines = toCart(draft);
  const summary = priceCart(lines, input.fulfilment);
  const withinBudget = budget === undefined || summary.totalSen <= budget;
  const overBudgetBySen = withinBudget ? 0 : summary.totalSen - budget!;
  if (!withinBudget) {
    relaxed.push(
      `The budget of ${formatRM(budget!)} is too low for ${countLabel(people, "person", "people")} with these requirements. This is the closest option, and it is ${formatRM(overBudgetBySen)} over budget.`,
    );
  }

  let freeDeliveryHint: string | undefined;
  if (input.fulfilment === "delivery" && summary.deliveryFeeSen > 0 && summary.amountToFreeDeliverySen > 0) {
    freeDeliveryHint = `Add ${formatRM(summary.amountToFreeDeliverySen)} more food for free delivery (saves ${formatRM(summary.deliveryFeeSen)}).`;
  }
  const deliveryMinimumNote =
    lines.length > 0 && !summary.meetsMinimum
      ? `Delivery needs a food subtotal of at least ${formatRM(STORE.delivery.minimumOrderSen)}. Add ${formatRM(summary.amountToMinimumSen)} more, or choose pickup.`
      : undefined;

  return {
    ok: lines.length > 0,
    people,
    lines,
    summary,
    perPersonSen: Math.round(summary.totalSen / people),
    budgetSen: budget,
    withinBudget,
    overBudgetBySen,
    adjustments,
    relaxed,
    freeDeliveryHint,
    deliveryMinimumNote,
  };
}
