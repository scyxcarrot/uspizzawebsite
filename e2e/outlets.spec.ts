import { expect, test, type Page } from "@playwright/test";
import { addSimple, expectNoHorizontalScroll, screenshot, useAfternoonClock } from "./helpers";

const BANGSAR = { latitude: 3.1307, longitude: 101.671 };

async function readStorage(page: Page) {
  return page.evaluate(() => JSON.stringify(window.localStorage));
}

test.describe("outlet selection", () => {
  test("first visit asks delivery or pickup without blocking the menu", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("outlet-bar")).toContainText("Delivery or pickup?");
    // The menu still works without choosing.
    await addSimple(page, "cola");
    await expect(page.getByTestId("cart-count")).toHaveText("1");
    await expectNoHorizontalScroll(page);
  });

  test("delivery with a shared (mocked) location assigns the nearest outlet", async ({ page, context }, testInfo) => {
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(BANGSAR);
    await page.goto("/");
    await page.getByTestId("outlet-start-delivery").click();
    const picker = page.getByTestId("outlet-picker");
    await picker.getByTestId("use-my-location").click();
    const result = picker.getByTestId("delivery-result");
    await expect(result).toContainText("Bangsar Outlet");
    await expect(result).toContainText("0.0 km away");
    await expect(result).toContainText("(estimate)");
    await expect(picker.getByTestId("outlet-disclaimer")).toContainText("This demo does not take orders for them.");
    await expect(picker.getByTestId("real-outlets-link")).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=US+Pizza+Kuala+Lumpur",
    );
    await expectNoHorizontalScroll(page);
    await screenshot(page, testInfo, "outlet-delivery");
    await result.getByTestId("choose-delivery-outlet").click();
    await expect(page.getByTestId("outlet-chip")).toContainText("Delivery from: Bangsar");

    // The choice survives a refresh, but the coordinates are never saved.
    await page.reload();
    await expect(page.getByTestId("outlet-chip")).toContainText("Delivery from: Bangsar");
    const stored = await readStorage(page);
    expect(stored).toContain("bangsar");
    expect(stored).not.toContain("101.67");
    expect(stored).not.toContain("3.13");
  });

  test("denied location falls back to picking an area, and out-of-range offers pickup", async ({ page, context }) => {
    await context.clearPermissions();
    await page.goto("/");
    await page.getByTestId("outlet-start-delivery").click();
    const picker = page.getByTestId("outlet-picker");
    await picker.getByTestId("use-my-location").click();
    await expect(picker.getByTestId("location-error")).toContainText("Location permission was denied. No problem: pick your area instead.");

    await picker.getByTestId("area-search").fill("kla");
    await picker.getByRole("button", { name: "Klang", exact: true }).click();
    await expect(picker.getByTestId("delivery-out-of-range")).toContainText("None of our outlets deliver to Klang");
    await picker.getByTestId("switch-to-pickup").click();

    // Pickup list, nearest to Klang first.
    const first = picker.getByTestId("pickup-outlet").first();
    await expect(first).toHaveAttribute("data-outlet-id", "subang-jaya");
    await expect(first).toContainText("km away");
    await expect(first).toContainText(/Open now|Closed now/);
    await expect(first).toContainText("daily");
    await first.getByRole("button", { name: "Pick up at Subang Jaya Outlet" }).click();
    await expect(page.getByTestId("outlet-chip")).toContainText("Pickup at: Subang Jaya");
  });

  test("pickup: search the list, choose, and the order shows the outlet", async ({ page }, testInfo) => {
    await useAfternoonClock(page);
    await page.goto("/");
    await page.getByTestId("outlet-start-pickup").click();
    const picker = page.getByTestId("outlet-picker");
    await picker.getByTestId("outlet-search").fill("klcc");
    await expect(picker.getByTestId("pickup-outlet")).toHaveCount(1);
    await screenshot(page, testInfo, "outlet-pickup");
    await picker.getByRole("button", { name: "Pick up at KLCC Outlet" }).click();
    await expect(page.getByTestId("outlet-chip")).toContainText("Pickup at: KLCC");

    await addSimple(page, "cola");
    await page.goto("/checkout");
    await expect(page.getByTestId("checkout-outlet")).toContainText("KLCC Outlet");
    await expect(page.getByTestId("checkout-outlet")).toContainText("Ready in about 15–20 min (estimate)");
    await page.getByLabel("Full name").fill("Ali");
    await page.getByLabel("Phone number").fill("0123456789");
    await page.getByTestId("place-order").click();
    await expect(page).toHaveURL(/\/order\/US-2001$/);
    await expect(page.getByTestId("order-outlet")).toHaveText("Pickup at KLCC Outlet");
  });

  test("the chatbot finds outlets and changes outlet (mock mode)", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("chat-launcher").click();
    const sent = page.waitForRequest((r) => r.url().includes("/api/chat"));
    await page.getByTestId("chat-input").fill("Which outlet is nearest to Bangsar?");
    await page.getByTestId("chat-send").click();
    // No location was shared, so none is sent.
    expect((await sent).postDataJSON().location).toBeUndefined();
    await expect(page.getByTestId("chat-assistant-message").last()).toContainText("The nearest outlet is Bangsar Outlet, 0.0 km away");

    await page.getByTestId("chat-input").fill("Switch to pickup at the KLCC outlet");
    await page.getByTestId("chat-send").click();
    await expect(page.getByTestId("chat-cart-note").last()).toContainText("Pickup at KLCC Outlet");
    await page.getByTestId("chat-close").click();
    await expect(page.getByTestId("outlet-chip")).toContainText("Pickup at: KLCC");
  });

  test("the site asks search engines not to index it", async ({ page }) => {
    const res = await page.goto("/");
    expect(res?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});

test.describe("outlet map", () => {
  // A 1×1 PNG, so tests never load real OpenStreetMap tiles.
  const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

  test("shows outlets, the customer's pin and the delivery radius, with attribution", async ({ page, context }, testInfo) => {
    await page.route("https://tile.openstreetmap.org/**", (r) => r.fulfill({ contentType: "image/png", body: PIXEL }));
    await context.grantPermissions(["geolocation"]);
    await context.setGeolocation(BANGSAR);
    await page.goto("/");
    await page.getByTestId("outlet-start-delivery").click();
    const picker = page.getByTestId("outlet-picker");
    await picker.getByTestId("use-my-location").click();
    await expect(picker.getByTestId("delivery-result")).toBeVisible();
    await picker.getByTestId("toggle-map").click();
    const map = picker.getByTestId("outlet-map");
    await expect(map).toBeVisible();
    await expect(map.locator(".leaflet-control-attribution")).toContainText("OpenStreetMap");
    // 6 outlets + the radius circle + the customer's pin.
    await expect(map.locator("path.leaflet-interactive")).toHaveCount(8);
    await expectNoHorizontalScroll(page);
    await screenshot(page, testInfo, "outlet-map");
  });

  test("the picker still works when the map tiles fail to load", async ({ page }) => {
    await page.route("https://tile.openstreetmap.org/**", (r) => r.abort());
    await page.goto("/");
    await page.getByTestId("outlet-start-pickup").click();
    const picker = page.getByTestId("outlet-picker");
    await picker.getByTestId("toggle-map").click();
    await expect(picker.getByTestId("outlet-map")).toBeVisible();
    await picker.getByRole("button", { name: "Pick up at Cheras Outlet" }).click();
    await expect(page.getByTestId("outlet-chip")).toContainText("Pickup at: Cheras");
  });
});
