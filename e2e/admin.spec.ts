import { expect, test, type Page } from "@playwright/test";
import { addSimple, chooseOutlet, expectNoHorizontalScroll, openCart } from "./helpers";

// Matches ADMIN_PASSWORD in playwright.config.ts (a test-only value).
const PASSWORD = "e2e-admin-password";

test.describe.configure({ mode: "serial" });

async function signIn(page: Page) {
  await page.goto("/admin");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByTestId("admin-login-submit").click();
  await expect(page.getByTestId("admin-panel")).toBeVisible();
}

async function resetData(page: Page) {
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("admin-reset").click();
  await expect(page.getByTestId("admin-message")).toContainText("Reset to original data");
}

test.describe("admin page", () => {
  test("is not indexed and asks for a password; a wrong one is refused", async ({ page }) => {
    const res = await page.goto("/admin");
    expect(res?.headers()["x-robots-tag"]).toContain("noindex");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    await expect(page.getByTestId("admin-login")).toBeVisible();
    await expect(page.getByTestId("admin-panel")).toHaveCount(0);

    await page.getByLabel("Password").fill("not-the-password");
    await page.getByTestId("admin-login-submit").click();
    await expect(page.getByTestId("admin-login-error")).toHaveText("That password is not correct.");
    await expect(page.getByTestId("admin-panel")).toHaveCount(0);

    // The admin API refuses changes without a session.
    const api = await page.request.post("/api/admin/item", {
      data: { id: "garlic-bread", soldOut: true },
      headers: { origin: new URL(page.url()).origin },
    });
    expect(api.status()).toBe(401);
  });

  test("signs in with an httpOnly cookie and works without sideways scrolling", async ({ page, context }) => {
    await signIn(page);
    const cookie = (await context.cookies()).find((c) => c.name === "admin_session");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Strict");
    expect(cookie?.value).not.toContain(PASSWORD);
    await expectNoHorizontalScroll(page);
    await page.getByTestId("admin-logout").click();
    await expect(page.getByTestId("admin-login")).toBeVisible();
  });

  test("marking an item sold out updates the menu, the cart, checkout and the chatbot", async ({ page, context }) => {
    // A customer already has Garlic Bread in their cart.
    await page.goto("/");
    await chooseOutlet(page, "pickup");
    await addSimple(page, "garlic-bread");
    await addSimple(page, "garlic-bread");
    await expect(page.getByTestId("cart-count")).toHaveText("2");

    // A second tab stays on the menu, to show it updates without a reload.
    const menu = await context.newPage();
    await menu.goto("/");
    await expect(menu.getByTestId("item-garlic-bread")).not.toHaveAttribute("data-sold-out", "true");

    await signIn(page);
    await page.getByTestId("admin-soldout-garlic-bread").click();
    await expect(page.getByTestId("admin-message")).toContainText("Garlic Bread: marked sold out");
    await expect(page.getByTestId("admin-soldout-garlic-bread")).toHaveText("Mark back in stock");
    await expect(page.getByTestId("admin-audit")).toContainText("Garlic Bread: marked sold out");

    // The open menu tab picks it up within a few seconds.
    await expect(menu.getByTestId("item-garlic-bread")).toHaveAttribute("data-sold-out", "true", { timeout: 12_000 });
    await expect(menu.getByTestId("item-garlic-bread").getByTestId("sold-out-badge")).toHaveText("Sold out");
    await menu.getByTestId("item-garlic-bread").click();
    await expect(menu.getByTestId("dialog-sold-out")).toHaveText("Sold out right now");
    await expect(menu.getByTestId("item-dialog").getByRole("button", { name: /add to cart/i })).toHaveCount(0);
    await menu.keyboard.press("Escape");

    // The cart shows the line as sold out, and checkout is blocked until it's removed.
    await openCart(menu);
    await expect(menu.getByTestId("cart-line-sold-out")).toContainText("Sold out");
    await menu.goto("/checkout");
    await menu.getByLabel("Full name").fill("Siti Aminah");
    await menu.getByLabel("Phone number").fill("012-345 6789");
    await menu.getByTestId("place-order").click();
    await expect(menu.getByTestId("checkout-cart-error")).toHaveText("Garlic Bread is sold out. Please remove it from your cart to continue.");

    // The chatbot (mock mode, real tools) says it's sold out and won't add it.
    await menu.goto("/");
    await menu.getByTestId("chat-launcher").click();
    await menu.getByTestId("chat-input").fill("Tell me about the garlic bread");
    await menu.getByTestId("chat-send").click();
    await expect(menu.getByTestId("chat-assistant-message").last()).toContainText("Garlic Bread is sold out right now");
    await menu.getByTestId("chat-input").fill("Add 1 garlic bread");
    await menu.getByTestId("chat-send").click();
    await expect(menu.getByTestId("chat-assistant-message").last()).toContainText("Garlic Bread is sold out right now");
    await expect(menu.getByTestId("cart-count")).toHaveText("2");

    await resetData(page);
    await expect(page.getByTestId("admin-soldout-garlic-bread")).toHaveText("Mark sold out");
  });

  test("a price change and a temporary outlet closure reach the site; bad input is refused", async ({ page, context }) => {
    await signIn(page);
    const row = page.getByTestId("admin-item-garlic-bread");
    await row.getByLabel("Price (RM)").fill("0.10");
    await page.getByTestId("admin-save-garlic-bread").click();
    await expect(page.getByTestId("admin-message")).toHaveText("Prices must be at least RM 0.50.");
    await row.getByLabel("Price (RM)").fill("12.90");
    await page.getByTestId("admin-save-garlic-bread").click();
    await expect(page.getByTestId("admin-message")).toContainText("Garlic Bread: price");

    await page.getByTestId("admin-outlet-klcc").getByLabel("Reason (optional)").fill("Staff training");
    await page.getByTestId("admin-outlet-klcc-close").click();
    await expect(page.getByTestId("admin-outlet-klcc-closed")).toContainText("Staff training");

    const shop = await context.newPage();
    await shop.goto("/");
    await expect(shop.getByTestId("item-garlic-bread")).toContainText("RM 12.90");
    await shop.getByTestId("outlet-start-pickup").click();
    const picker = shop.getByTestId("outlet-picker");
    await picker.getByTestId("outlet-search").fill("klcc");
    await expect(picker.getByTestId("pickup-outlet").first()).toContainText("Closed now");

    // A closed outlet can't take orders.
    await picker.getByRole("button", { name: "Pick up at KLCC Outlet" }).click();
    await addSimple(shop, "cola");
    await shop.goto("/checkout");
    await shop.getByLabel("Full name").fill("Ali");
    await shop.getByLabel("Phone number").fill("0123456789");
    await shop.getByTestId("place-order").click();
    await expect(shop.locator("#checkout-outlet-error")).toContainText("KLCC Outlet is temporarily closed until");
    await expect(shop.locator("#checkout-outlet-error")).toContainText("(Staff training). Please choose another outlet.");
    await expect(shop).toHaveURL(/\/checkout$/);

    await resetData(page);
  });
});
