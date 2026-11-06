import { expect, test, type Page } from "@playwright/test";
import { addSimple, isPhone, overlaps, screenshot } from "./helpers";

async function openChat(page: Page) {
  await page.getByTestId("chat-launcher").click();
  await expect(page.getByTestId("chat-panel")).toBeVisible();
}

async function ask(page: Page, text: string) {
  await page.getByTestId("chat-input").fill(text);
  await page.getByTestId("chat-send").click();
}

test.describe("chat widget (mock mode)", () => {
  test("a chat request adds to the cart, and cart and chat survive a refresh", async ({ page }, testInfo) => {
    await page.goto("/");
    await openChat(page);
    await ask(page, "Add two large pepperoni pizzas");

    await expect(page.getByTestId("chat-cart-note")).toHaveText(/Added to cart: 2 × Large Beef Pepperoni \(Hand-Tossed\)/);
    await expect(page.getByTestId("chat-assistant-message").last()).toContainText("Hand-Tossed");
    await expect(page.getByTestId("cart-count")).toHaveText("2");
    await screenshot(page, testInfo, "chat-open");

    await page.reload();
    await expect(page.getByTestId("cart-count")).toHaveText("2");
    await openChat(page);
    await expect(page.getByTestId("chat-user-message")).toHaveText(/Add two large pepperoni pizzas/);
    await expect(page.getByTestId("chat-cart-note")).toBeVisible();

    // Clear chat empties the conversation.
    await page.getByTestId("chat-clear").click();
    await expect(page.getByTestId("chat-user-message")).toHaveCount(0);
  });

  test("asks for a size instead of guessing", async ({ page }) => {
    await page.goto("/");
    await openChat(page);
    await ask(page, "Add a margherita");
    await expect(page.getByTestId("chat-assistant-message").last()).toContainText("Which size");
    await expect(page.getByTestId("cart-count")).toHaveText("0");
  });

  test("shows web sources as safe links", async ({ page }) => {
    await page.goto("/");
    await openChat(page);
    await ask(page, "What's the weather in KL?");
    const link = page.getByTestId("chat-sources").getByRole("link");
    await expect(link).toHaveAttribute("href", /^https:\/\//);
    await expect(link).toHaveAttribute("target", "_blank");
  });

  test("keyboard: Enter sends, Escape closes and returns focus", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("chat-launcher").focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("chat-input")).toBeFocused();
    await page.keyboard.type("Hello");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("chat-user-message")).toHaveText(/Hello/);
    await expect(page.getByTestId("chat-assistant-message")).toContainText("Mock");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("chat-panel")).toBeHidden();
    await expect(page.getByTestId("chat-launcher")).toBeFocused();
  });

  test("chat button never overlaps the cart bar or header controls", async ({ page }) => {
    await page.goto("/");
    await addSimple(page, "garlic-bread");
    const launcher = await page.getByTestId("chat-launcher").boundingBox();
    expect(launcher).not.toBeNull();

    const controls = [page.getByTestId("header-cart"), page.getByRole("link", { name: /track order/i }).first()];
    if (isPhone(page)) controls.push(page.getByTestId("view-cart-bar"));
    for (const control of controls) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      expect(overlaps(launcher!, box!), "chat button overlaps a control").toBe(false);
    }

    // At the bottom of the checkout page it must not cover the place-order button.
    await page.getByTestId("item-garlic-bread").click();
    await page.getByTestId("item-dialog").getByRole("button", { name: /increase quantity/i }).click();
    await page.getByTestId("item-dialog").getByRole("button", { name: /add to cart/i }).click();
    await page.goto("/checkout");
    await page.getByTestId("place-order").scrollIntoViewIfNeeded();
    const place = await page.getByTestId("place-order").boundingBox();
    const launcher2 = await page.getByTestId("chat-launcher").boundingBox();
    expect(overlaps(launcher2!, place!), "chat button covers Place order").toBe(false);
  });

  test("chat state survives resizing and rotation", async ({ page }) => {
    await page.goto("/");
    await openChat(page);
    await ask(page, "Hello there");
    await expect(page.getByTestId("chat-assistant-message")).toBeVisible();
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: size.height, height: size.width });
    await expect(page.getByTestId("chat-user-message")).toHaveText(/Hello there/);
    await page.setViewportSize(size);
    await expect(page.getByTestId("chat-panel")).toBeVisible();
  });
});

test.describe("chat failures keep ordering working", () => {
  test("rate limit shows a friendly message with retry", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/chat", async (route) => {
      calls++;
      if (calls === 1) {
        await route.fulfill({
          status: 429,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "rate_limited", message: "The assistant is getting a lot of questions right now. Please wait a moment and try again.", retryable: true },
          }),
        });
      } else {
        await route.continue();
      }
    });
    await page.goto("/");
    await openChat(page);
    await ask(page, "Hello");
    await expect(page.getByTestId("chat-error")).toContainText("lot of questions");
    await page.getByTestId("chat-retry").click();
    await expect(page.getByTestId("chat-assistant-message")).toContainText("Mock");
    await expect(page.getByTestId("chat-error")).toHaveCount(0);
    await expect(page.getByTestId("chat-user-message")).toHaveCount(1);
  });

  test("missing key and network failure show messages, and ordering still works", async ({ page }) => {
    await page.route("**/api/chat", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "missing_key", message: "The AI assistant isn't set up on this site right now. You can still browse the menu, order, and track orders as normal.", retryable: false },
        }),
      }),
    );
    await page.goto("/");
    await openChat(page);
    await ask(page, "Hi");
    await expect(page.getByTestId("chat-error")).toContainText("isn't set up");
    await expect(page.getByTestId("chat-retry")).toHaveCount(0);

    await page.unroute("**/api/chat");
    await page.route("**/api/chat", (route) => route.abort("internetdisconnected"));
    await ask(page, "Hi again");
    await expect(page.getByTestId("chat-error").last()).toContainText("couldn't reach the assistant");
    await page.getByTestId("chat-close").click();

    // Ordering is unaffected.
    await addSimple(page, "beef-bolognese");
    await expect(page.getByTestId("cart-count")).toHaveText("1");
    await page.goto("/checkout");
    await page.getByText("Pickup", { exact: true }).click();
    await page.getByLabel("Full name").fill("Ali");
    await page.getByLabel("Phone number").fill("0123456789");
    await page.getByTestId("place-order").click();
    await expect(page).toHaveURL(/\/order\/US-2001$/);
  });
});
