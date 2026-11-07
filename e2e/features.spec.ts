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
