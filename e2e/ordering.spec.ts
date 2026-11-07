import { expect, test } from "@playwright/test";
import { addPizza, addSimple, chooseOutlet, expectNoHorizontalScroll, isPhone, openCart, screenshot } from "./helpers";

test.describe("ordering flow", () => {
  test("full order from menu to tracking", async ({ page }, testInfo) => {
    await page.clock.install();
    await page.goto("/");
    await expect(page.getByTestId("site-name")).toHaveText("US Pizza Demo");
    await expect(page.getByTestId("footer-demo-note")).toHaveText("Demo site with dummy data.");
    await expect(page.locator("body")).not.toContainText(/fictional|not a real store|demo hours/i);
    await screenshot(page, testInfo, "menu");

    // Pizza with options: Large + Cheese-Stuffed = RM 39 + RM 5
    await page.getByTestId("item-beef-pepperoni").click();
    const dialog = page.getByTestId("item-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("radio", { name: /^Large/ }).check();
    await dialog.getByRole("radio", { name: /^Cheese-Stuffed/ }).check();
    await dialog.getByRole("button", { name: /increase quantity/i }).click();
    await expect(dialog.getByTestId("dialog-total")).toHaveText("RM 88.00");
    await screenshot(page, testInfo, "item-dialog");
    await dialog.getByRole("button", { name: /add to cart/i }).click();
    await expect(page.getByTestId("notice")).toContainText("Added to cart: 2 × Large Beef Pepperoni (Cheese-Stuffed)");
    await expect(page.getByTestId("cart-count")).toHaveText("2");

    await addSimple(page, "cola");
    if (isPhone(page)) await expect(page.getByTestId("view-cart-bar")).toBeVisible();
    else await expect(page.getByTestId("view-cart-bar")).toBeHidden();

    // Cart: change quantity and check totals (2 × 44 + 5 = 93, free delivery)
    await openCart(page);
    const cart = page.getByTestId("cart-panel");
    await expect(cart.getByTestId("subtotal")).toHaveText("RM 93.00");
    await expect(cart.getByTestId("delivery-fee")).toHaveText("Free");
    await cart.getByRole("button", { name: /increase quantity of cola/i }).click();
    await expect(cart.getByTestId("total")).toHaveText("RM 98.00");
    await screenshot(page, testInfo, "cart");
    await cart.getByTestId("go-to-checkout").click();

    // Checkout
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
    await page.getByTestId("place-order").click();
    await expect(page.getByText("Please enter your name")).toBeVisible();
    await page.getByLabel("Full name").fill("Siti Aminah");
    await page.getByLabel("Phone number").fill("012-345 6789");
    await page.getByLabel("Delivery address").fill("12 Jalan Demo, Petaling Jaya");
    // No outlet chosen yet: checkout asks for one.
    await page.getByTestId("place-order").click();
    await expect(page.getByText("Please choose the outlet to deliver from.")).toBeVisible();
    await page.goto("/");
    await chooseOutlet(page, "delivery");
    await page.goto("/checkout");
    await expect(page.getByTestId("checkout-outlet")).toContainText("Petaling Jaya Outlet");
    await expect(page.getByText("No real payment is taken.", { exact: true })).toBeVisible();
    await page.getByLabel("Full name").fill("Siti Aminah");
    await page.getByLabel("Phone number").fill("012-345 6789");
    await page.getByLabel("Delivery address").fill("12 Jalan Demo, Petaling Jaya");
    await screenshot(page, testInfo, "checkout");
    await page.getByTestId("place-order").click();

    // Confirmation and live tracking
    await expect(page).toHaveURL(/\/order\/US-2001$/);
    await expect(page.getByRole("heading", { name: /Thanks, Siti!/ })).toBeVisible();
    await expect(page.getByTestId("order-status")).toHaveText("Order received");
    await expect(page.getByTestId("order-total")).toHaveText("RM 98.00");
    await expect(page.getByTestId("cart-count")).toHaveText("0");
    await expect(page.getByTestId("order-outlet")).toHaveText("From Petaling Jaya Outlet");
    await screenshot(page, testInfo, "order");

    // The status changes without a page refresh.
    await page.clock.fastForward(35_000);
    await expect(page.getByTestId("order-status")).toHaveText("Preparing");
    await page.clock.fastForward(60_000);
    await expect(page.getByTestId("order-status")).toHaveText("Baking");

    // Track page finds the order.
    await page.goto("/track");
    await page.getByLabel("Order ID").fill("us-2001");
    await screenshot(page, testInfo, "track");
    await page.getByRole("button", { name: "Track order" }).click();
    await expect(page).toHaveURL(/\/order\/US-2001$/);
    await expect(page.getByTestId("order-status")).toBeVisible();
  });

  test("unknown order IDs show a helpful message", async ({ page }) => {
    await page.goto("/order/US-9999");
    await expect(page.getByTestId("order-not-found")).toContainText("US-9999");

    await page.goto("/track");
    await page.getByLabel("Order ID").fill("US-9999");
    await page.getByRole("button", { name: "Track order" }).click();
    await expect(page.getByTestId("track-error")).toContainText("couldn't find order US-9999");
  });

  test("seeded orders show their fixed status", async ({ page }) => {
    await page.goto("/order/US-1002");
    await expect(page.getByTestId("order-status")).toHaveText("Out for delivery");
    await expect(page.getByTestId("order-outlet")).toHaveText("From Bangsar Outlet");
  });

  test("delivery minimum is enforced and pickup removes the address and fee", async ({ page }) => {
    await page.goto("/");
    await chooseOutlet(page, "delivery");
    await addSimple(page, "cola");
    await page.goto("/checkout");
    await expect(page.getByTestId("minimum-warning")).toBeVisible();
    await page.getByLabel("Full name").fill("Ali");
    await page.getByLabel("Phone number").fill("0123456789");
    await page.getByLabel("Delivery address").fill("1 Jalan Ujian, Shah Alam");
    await page.getByTestId("place-order").click();
    await expect(page.getByTestId("checkout-cart-error")).toContainText("at least RM 20.00");
    await expect(page).toHaveURL(/\/checkout$/);

    await page.getByText("Pickup", { exact: true }).click();
    await expect(page.getByLabel("Delivery address")).toHaveCount(0);
    await expect(page.getByTestId("delivery-fee").first()).toHaveText("Free");
    await page.getByTestId("place-order").click();
    await expect(page).toHaveURL(/\/order\/US-2001$/);
    await expect(page.getByTestId("order-total")).toHaveText("RM 5.00");
  });

  test("cart survives a page refresh", async ({ page }) => {
    await page.goto("/");
    await addPizza(page, "margherita", "Large");
    await expect(page.getByTestId("cart-count")).toHaveText("1");
    await page.reload();
    await expect(page.getByTestId("cart-count")).toHaveText("1");
    await openCart(page);
    await expect(page.getByTestId("cart-line")).toContainText("Margherita");
  });

  test("no sideways scrolling on any main page", async ({ page }) => {
    await page.goto("/");
    await addPizza(page, "seafood-deluxe", "Large", "Cheese-Stuffed");
    for (const path of ["/", "/checkout", "/track", "/order/US-1001", "/order/US-9999"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectNoHorizontalScroll(page);
    }
  });
});
