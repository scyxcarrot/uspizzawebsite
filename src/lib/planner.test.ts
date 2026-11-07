import { describe, expect, it } from "vitest";
import { MENU, findMenuItem } from "@/data/menu";
import { planOrder, exclusionTerms, isExcluded, type PlanInput } from "@/lib/planner";
import { priceCart } from "@/lib/pricing";

const plan = (input: Partial<PlanInput> & { people: number }) => planOrder({ fulfilment: "delivery", ...input });
const items = (p: ReturnType<typeof planOrder>) => p.lines.map((l) => ({ ...l, item: findMenuItem(l.itemId)! }));
const count = (p: ReturnType<typeof planOrder>, pred: (l: ReturnType<typeof items>[number]) => boolean) =>
  items(p)
    .filter(pred)
    .reduce((n, l) => n + l.quantity, 0);
const pizzas = (p: ReturnType<typeof planOrder>) => count(p, (l) => l.item.kind === "pizza");

describe("planOrder: the portion rule", () => {
  it("gives about one Large pizza per 2 to 3 people, a side per 3 people and a drink each", () => {
    const p = plan({ people: 6 });
    expect(pizzas(p)).toBe(3);
    expect(count(p, (l) => l.size === "large")).toBe(3);
    expect(count(p, (l) => l.item.category === "sides")).toBe(2);
    expect(count(p, (l) => l.item.category === "drinks")).toBe(6);
    expect(count(p, (l) => l.item.category === "desserts")).toBe(0);
    expect(p.withinBudget).toBe(true);
    expect(p.adjustments).toEqual([]);
    expect(p.relaxed).toEqual([]);
  });

  it.each([
    [1, 1],
    [2, 1],
    [3, 2],
    [5, 2],
    [10, 4],
    [20, 8],
  ])("%i people get %i pizzas", (people, expected) => {
    expect(pizzas(plan({ people }))).toBe(expected);
  });

  it("does not repeat a pizza until every suitable one has been used", () => {
    const p = plan({ people: 10 });
    const pizzaLines = items(p).filter((l) => l.item.kind === "pizza");
    expect(pizzaLines.every((l) => l.quantity === 1)).toBe(true);
  });

  it("respects declined sides and drinks, and adds dessert only when asked", () => {
    const p = plan({ people: 4, sides: false, drinks: false, dessert: true });
    expect(count(p, (l) => l.item.category === "sides")).toBe(0);
    expect(count(p, (l) => l.item.category === "drinks")).toBe(0);
    expect(count(p, (l) => l.item.category === "desserts")).toBe(2);
  });
});

describe("planOrder: totals come from the pricing functions", () => {
  it.each([
    { people: 6, budgetSen: 12000, vegetarians: 2, exclude: ["beef"] },
    { people: 3, fulfilment: "pickup" as const },
    { people: 1, budgetSen: 1500 },
    { people: 8, dessert: true, spicy: true },
  ])("matches priceCart for %o", (input) => {
    const p = plan(input);
    const expected = priceCart(p.lines, input.fulfilment ?? "delivery");
    expect(p.summary.subtotalSen).toBe(expected.subtotalSen);
    expect(p.summary.deliveryFeeSen).toBe(expected.deliveryFeeSen);
    expect(p.summary.totalSen).toBe(expected.totalSen);
    expect(p.perPersonSen).toBe(Math.round(expected.totalSen / p.people));
  });

  it("charges no delivery fee for pickup", () => {
    const p = plan({ people: 1, fulfilment: "pickup" });
    expect(p.summary.deliveryFeeSen).toBe(0);
    expect(p.freeDeliveryHint).toBeUndefined();
    expect(p.deliveryMinimumNote).toBeUndefined();
  });

  it("gives a free-delivery hint when the delivery fee applies", () => {
    const p = plan({ people: 1, drinks: false, sides: false }); // one Large pizza, under RM 50
    expect(p.summary.deliveryFeeSen).toBe(500);
    expect(p.freeDeliveryHint).toMatch(/^Add RM \d+\.\d\d more food for free delivery/);
  });
});

describe("planOrder: budgets", () => {
  it.each([3000, 6000, 9000, 12000, 15000, 25000])("never goes over a reachable budget of %i sen for 6 people", (budgetSen) => {
    const p = plan({ people: 6, budgetSen });
    expect(p.withinBudget).toBe(true);
    expect(p.summary.totalSen).toBeLessThanOrEqual(budgetSen);
  });

  it("feeds 6 people under RM 120 with 2 vegetarians and no beef", () => {
    const p = plan({ people: 6, budgetSen: 12000, vegetarians: 2, exclude: ["beef"] });
    expect(p.withinBudget).toBe(true);
    expect(p.summary.totalSen).toBeLessThanOrEqual(12000);
    expect(items(p).some((l) => l.item.tags.includes("Beef"))).toBe(false);
    expect(count(p, (l) => l.item.kind === "pizza" && l.item.tags.includes("Vegetarian"))).toBeGreaterThanOrEqual(1);
    expect(pizzas(p)).toBeGreaterThanOrEqual(2);
  });

  it("reports a cheaper swap that keeps to the rule as an adjustment only", () => {
    const p = plan({ people: 6, budgetSen: 16000 }); // RM 169 normally; water instead of cola fits
    expect(p.withinBudget).toBe(true);
    expect(p.adjustments).toEqual(["Drinks changed to Mineral Water (RM 3.00 each) to fit the budget."]);
    expect(p.relaxed).toEqual([]);
    expect(count(p, (l) => l.itemId === "mineral-water")).toBe(6);
  });

  it("reports cut portions as relaxed", () => {
    const p = plan({ people: 6, budgetSen: 9000 });
    expect(p.withinBudget).toBe(true);
    expect(p.relaxed.length).toBeGreaterThan(0);
    expect(p.relaxed).toContain("Drinks left out to fit the budget.");
  });

  it("returns the closest option, clearly over budget, when the budget is impossible", () => {
    const p = plan({ people: 10, budgetSen: 1000 });
    expect(p.ok).toBe(true);
    expect(p.withinBudget).toBe(false);
    expect(p.overBudgetBySen).toBe(p.summary.totalSen - 1000);
    expect(pizzas(p)).toBe(1);
    expect(count(p, (l) => l.size === "regular")).toBe(1);
    expect(p.relaxed.join(" ")).toMatch(/too low for 10 people.*closest option.*over budget/);
    // Drinks were left out, so the earlier swap to water is not reported.
    expect(p.adjustments.join(" ")).not.toMatch(/Drinks changed/);
  });

  it("never drops the vegetarians' pizza to save money", () => {
    const p = plan({ people: 6, vegetarians: 2, budgetSen: 3000 });
    expect(count(p, (l) => l.item.kind === "pizza" && l.item.tags.includes("Vegetarian"))).toBeGreaterThanOrEqual(1);
  });
});

describe("planOrder: dietary needs and exclusions are never relaxed", () => {
  it("gives every vegetarian group only vegetarian items", () => {
    const p = plan({ people: 5, vegetarians: 5, sides: true, dessert: true });
    expect(items(p).every((l) => l.item.tags.includes("Vegetarian"))).toBe(true);
  });

  it("gives one Vegetarian pizza per 2 to 3 vegetarians", () => {
    expect(count(plan({ people: 8, vegetarians: 2 }), (l) => l.item.kind === "pizza" && l.item.tags.includes("Vegetarian"))).toBe(1);
    expect(count(plan({ people: 8, vegetarians: 5 }), (l) => l.item.kind === "pizza" && l.item.tags.includes("Vegetarian"))).toBe(2);
  });

  it.each([["beef"], ["seafood"], ["nuts"], ["no meat"], ["Spicy"], ["prawns"], ["dairy"]])("leaves out %s", (term) => {
    const p = plan({ people: 6, dessert: true, exclude: [term] });
    const terms = exclusionTerms([term]);
    expect(items(p).some((l) => isExcluded(l.item, terms))).toBe(false);
  });

  it("treats spicy: false as no spicy items, and spicy: true as one spicy pizza", () => {
    expect(items(plan({ people: 6, spicy: false })).some((l) => l.item.tags.includes("Spicy"))).toBe(false);
    expect(items(plan({ people: 6, spicy: true })).some((l) => l.item.kind === "pizza" && l.item.tags.includes("Spicy"))).toBe(true);
  });

  it("says so when no pizza fits, and still respects the exclusion", () => {
    const p = plan({ people: 4, exclude: ["gluten"] });
    expect(pizzas(p)).toBe(0);
    expect(p.relaxed.join(" ")).toMatch(/No pizza on the menu fits/);
    expect(items(p).some((l) => l.item.allergens.includes("gluten"))).toBe(false);
  });

  it("says so when no vegetarian pizza fits the other exclusions", () => {
    const p = plan({ people: 4, vegetarians: 2, exclude: ["dairy"] });
    expect(p.relaxed.join(" ")).toMatch(/No vegetarian pizza fits/);
    expect(items(p).some((l) => l.item.allergens.includes("dairy"))).toBe(false);
  });

  it("maps common words to tags and allergens", () => {
    expect(exclusionTerms(["no meat"])).toEqual(expect.arrayContaining(["beef", "chicken"]));
    expect(exclusionTerms(["shellfish"])).toContain("seafood");
    const sambal = MENU.find((i) => i.id === "spicy-sambal-chicken")!;
    expect(isExcluded(sambal, exclusionTerms(["seafood"]))).toBe(true); // belacan
  });
});

describe("planOrder: limits", () => {
  it("caps the group size and keeps every line within cart limits", () => {
    const p = plan({ people: 50 });
    expect(p.people).toBe(20);
    expect(p.lines.every((l) => l.quantity <= 20)).toBe(true);
  });
});
