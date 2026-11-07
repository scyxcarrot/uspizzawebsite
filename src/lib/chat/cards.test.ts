import { describe, expect, it } from "vitest";
import { sanitizeCard, sanitizeCards } from "@/lib/chat/cards";

describe("chat cards are validated in the browser", () => {
  it("rebuilds plan lines from the menu and drops unknown items", () => {
    const card = sanitizeCard({
      kind: "plan",
      people: 2,
      fulfilment: "delivery",
      lines: [
        { itemId: "cola", quantity: 2, price: 1 },
        { itemId: "free-pizza", quantity: 1 },
      ],
      withinBudget: true,
      adjustments: [],
      relaxed: [],
    });
    expect(card).toMatchObject({ kind: "plan", lines: [{ lineId: "cola", itemId: "cola", quantity: 2 }] });
  });

  it("rejects malformed cards and unknown kinds", () => {
    expect(sanitizeCard({ kind: "html", html: "<script>" })).toBeUndefined();
    expect(sanitizeCard({ kind: "plan", people: 999 })).toBeUndefined();
    expect(sanitizeCard(null)).toBeUndefined();
    expect(sanitizeCards("nope")).toEqual([]);
  });
});
