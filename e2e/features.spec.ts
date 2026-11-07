import { expect, test, type Page } from "@playwright/test";
import { formatRM } from "../src/lib/money";
import { planOrder } from "../src/lib/planner";
import { expectNoHorizontalScroll, screenshot } from "./helpers";

async function openChat(page: Page) {
  await page.getByTestId("chat-launcher").click();
  await expect(page.getByTestId("chat-panel")).toBeVisible();
}

async function ask(page: Page, text: string) {
  await page.getByTestId("chat-input").fill(text);
  await page.getByTestId("chat-send").click();
}

test.describe("group order planner (mock mode)", () => {
  test("proposes a plan, adds nothing until 'Add all to cart', then adds it in one tap", async ({ page }, testInfo) => {
    const expected = planOrder({ people: 6, budgetSen: 12000, vegetarians: 2, exclude: ["beef"], fulfilment: "delivery" });
    const itemCount = expected.lines.reduce((n, l) => n + l.quantity, 0);

    await page.goto("/");
    await openChat(page);
    await ask(page, "Feed 6 people under RM120, 2 are vegetarian, no beef");

    const card = page.getByTestId("chat-plan-card");
    await expect(card).toBeVisible();
    await expect(card).toContainText("Group order for 6");
    await expect(card.getByTestId("chat-plan-total")).toHaveText(formatRM(expected.summary.totalSen));
    await expect(card).not.toContainText("Beef");
    await expect(page.getByTestId("chat-assistant-message").last()).toContainText("Nothing is in your cart yet");
    await expect(page.getByTestId("cart-count")).toHaveText("0");
    await expectNoHorizontalScroll(page);
    await screenshot(page, testInfo, "plan-card");

    // The button adds in code: no further chat request is made.
    let chatRequests = 0;
    page.on("request", (r) => {
      if (r.url().includes("/api/chat")) chatRequests++;
    });
    await card.getByTestId("chat-plan-add").click();
    await expect(page.getByTestId("cart-count")).toHaveText(String(itemCount));
    await expect(card.getByTestId("chat-plan-added")).toBeVisible();
    await expect(page.getByTestId("chat-cart-note").last()).toContainText(`${itemCount} items from the group order`);
    expect(chatRequests).toBe(0);

    // Saying yes afterwards can't add the same plan again.
    await ask(page, "yes");
    await expect(page.getByTestId("chat-assistant-message").last()).toContainText("no group order plan waiting");
    await expect(page.getByTestId("cart-count")).toHaveText(String(itemCount));

    // The plan stays marked as added after a refresh.
    await page.reload();
    await openChat(page);
    await expect(page.getByTestId("chat-plan-added")).toBeVisible();
  });

  test("saying yes adds the proposed plan", async ({ page }) => {
    const expected = planOrder({ people: 2, fulfilment: "delivery" });
    const itemCount = expected.lines.reduce((n, l) => n + l.quantity, 0);
    await page.goto("/");
    await openChat(page);
    await ask(page, "Plan food for 2 people");
    await expect(page.getByTestId("chat-plan-card")).toBeVisible();
    await expect(page.getByTestId("cart-count")).toHaveText("0");
    await ask(page, "Yes please");
    await expect(page.getByTestId("cart-count")).toHaveText(String(itemCount));
    await expect(page.getByTestId("chat-plan-added")).toBeVisible();
  });

  test("an impossible budget shows the closest option, clearly marked", async ({ page }) => {
    await page.goto("/");
    await openChat(page);
    await ask(page, "Feed 10 people for RM10");
    const card = page.getByTestId("chat-plan-card");
    await expect(card.getByTestId("chat-plan-notes")).toContainText("Over budget");
    await expect(card.getByTestId("chat-plan-notes")).toContainText("too low for 10 people");
    await expect(page.getByTestId("chat-assistant-message").last()).toContainText("over your budget");
    await expectNoHorizontalScroll(page);
  });
});

test.describe("rich chat cards (mock mode)", () => {
  test("item cards show real prices and tags, and their buttons add without asking the AI", async ({ page }, testInfo) => {
    await page.goto("/");
    await openChat(page);
    await ask(page, "Which vegetarian pizzas do you have?");
    const cards = page.getByTestId("chat-item-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText("Margherita");
    await expect(cards.first()).toContainText("Regular RM 22.00 · Large RM 34.00");
    await expect(cards.first()).toContainText("Vegetarian");
    await expectNoHorizontalScroll(page);
    await screenshot(page, testInfo, "item-cards");

    let chatRequests = 0;
    page.on("request", (r) => {
      if (r.url().includes("/api/chat")) chatRequests++;
    });
    await page.getByRole("button", { name: "Add a Large Margherita" }).click();
    await expect(page.getByTestId("cart-count")).toHaveText("1");
    await expect(page.getByTestId("notice")).toContainText("Added to cart: 1 × Large Margherita (Hand-Tossed)");
    expect(chatRequests).toBe(0);
  });

  test("cart and order status cards", async ({ page }, testInfo) => {
    await page.goto("/");
    await openChat(page);
    await ask(page, "Add a cola");
    await expect(page.getByTestId("cart-count")).toHaveText("1");
    await ask(page, "What's in my cart?");
    const cart = page.getByTestId("chat-cart-card");
    await expect(cart).toContainText("1 × Cola");
    await expect(cart.getByTestId("chat-cart-card-total")).toHaveText("RM 10.00");
    await expect(cart).toContainText("Add RM 15.00 more, or choose pickup");

    await ask(page, "Where's order US-1002?");
    const order = page.getByTestId("chat-order-card");
    await expect(order.getByTestId("chat-order-status")).toHaveText("Out for delivery");
    await expect(order.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "75");
    await expectNoHorizontalScroll(page);
    await screenshot(page, testInfo, "order-card");
    await order.getByRole("link", { name: "Open order tracker" }).click();
    await expect(page).toHaveURL(/\/order\/US-1002$/);
  });
});

test.describe("page awareness (mock mode)", () => {
  test("'Is this spicy?' and 'add this' work for the open item without naming it", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.getByTestId("item-spicy-sambal-chicken").click();
    const dialog = page.getByTestId("item-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByTestId("ask-about-item").click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId("chat-panel")).toBeVisible();
    await expect(page.getByTestId("chat-context")).toContainText("Asking about: Spicy Sambal Chicken");
    await expectNoHorizontalScroll(page);

    // The request carries the open item.
    const sent = page.waitForRequest((r) => r.url().includes("/api/chat"));
    await ask(page, "Is this spicy?");
    expect((await sent).postDataJSON().page).toEqual({ path: "/", itemId: "spicy-sambal-chicken" });
    await expect(page.getByTestId("chat-assistant-message").last()).toContainText("Yes, the Spicy Sambal Chicken is spicy");
    await expect(page.getByTestId("chat-item-card")).toHaveAttribute("data-item-id", "spicy-sambal-chicken");
    await screenshot(page, testInfo, "page-awareness");

    await ask(page, "Add this, large");
    await expect(page.getByTestId("chat-cart-note").last()).toContainText("Added to cart: 1 × Large Spicy Sambal Chicken (Hand-Tossed)");
    await expect(page.getByTestId("cart-count")).toHaveText("1");

    // Clearing the context stops sending the item.
    await page.getByTestId("chat-context-clear").click();
    await expect(page.getByTestId("chat-context")).toBeHidden();
    const next = page.waitForRequest((r) => r.url().includes("/api/chat"));
    await ask(page, "Is this spicy?");
    expect((await next).postDataJSON().page).toEqual({ path: "/" });
  });

  test("sends the current page from other pages", async ({ page }) => {
    await page.goto("/track");
    await openChat(page);
    const sent = page.waitForRequest((r) => r.url().includes("/api/chat"));
    await ask(page, "Hello");
    expect((await sent).postDataJSON().page).toEqual({ path: "/track" });
  });
});
