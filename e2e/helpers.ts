import { expect, type Page, type TestInfo } from "@playwright/test";

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1440) < 768;

/** Open the cart: the fixed "View cart" bar on phones, the header button elsewhere. */
/**
 * Run the browser clock from 3 am Malaysia time (it keeps ticking from there),
 * to show that orders work in the middle of the night: outlets are open 24 hours.
 */
export async function useNightClock(page: Page) {
  await page.clock.install({ time: new Date("2026-11-07T19:00:00Z") });
}

export async function openCart(page: Page) {
  if (isPhone(page)) {
    await page.getByTestId("view-cart-bar").getByRole("button", { name: /view cart/i }).click();
  } else {
    await page.getByTestId("header-cart").click();
  }
  await expect(page.getByTestId("cart-panel")).toBeVisible();
}

export async function addPizza(page: Page, id: string, size: "Regular" | "Large", crust?: string) {
  await page.getByTestId(`item-${id}`).click();
  const dialog = page.getByTestId("item-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("radio", { name: new RegExp(`^${size}`) }).check();
  if (crust) await dialog.getByRole("radio", { name: new RegExp(`^${crust}`) }).check();
  await dialog.getByRole("button", { name: /add to cart/i }).click();
  await expect(dialog).toBeHidden();
}

export async function addSimple(page: Page, id: string) {
  await page.getByTestId(`item-${id}`).click();
  const dialog = page.getByTestId("item-dialog");
  await dialog.getByRole("button", { name: /add to cart/i }).click();
  await expect(dialog).toBeHidden();
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth - doc.clientWidth;
  });
  expect(overflow, "page should not scroll sideways").toBeLessThanOrEqual(0);
}

export async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({
    path: `screenshots/${testInfo.project.name}/${name}.png`,
    fullPage: false,
    animations: "disabled",
  });
}

/** Boxes overlap if they intersect by more than a pixel. */
export function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 && a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;
}

/** Choose a demo outlet from the bar under the header (needs no outlet chosen yet). */
export async function chooseOutlet(page: Page, mode: "delivery" | "pickup" = "delivery") {
  await page.getByTestId(`outlet-start-${mode}`).click();
  const picker = page.getByTestId("outlet-picker");
  await expect(picker).toBeVisible();
  if (mode === "delivery") {
    await picker.getByRole("button", { name: "Petaling Jaya", exact: true }).click();
    await picker.getByTestId("choose-delivery-outlet").click();
  } else {
    await picker.getByRole("button", { name: "Pick up at Petaling Jaya Outlet" }).click();
  }
  await expect(picker).toBeHidden();
  await expect(page.getByTestId("outlet-chip")).toContainText("Petaling Jaya");
}
