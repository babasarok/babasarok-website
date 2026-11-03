import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";

export async function openProductFromList(page: Page, name: RegExp): Promise<void> {
  await page.goto("/product/", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name }).first().click();
  await expect(page.getByRole("button", { name: /Kosárba/ })).toBeVisible();
}

export async function chooseOption(page: Page, name: RegExp): Promise<void> {
  await page.getByRole("button", { name }).click();
}

export async function addToBasket(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Kosárba|Kosár frissítése/ }).click();
  await expect(page.getByText("A termék a kosárban van.")).toBeVisible();
}

export async function expectNavCount(page: Page, count: number): Promise<void> {
  await expect(page.getByTestId("nav-basket-count").first()).toHaveText(String(count));
}

export async function goToCheckoutInApp(page: Page): Promise<void> {
  await page.getByRole("link", { name: /Tovább a pénztárhoz/ }).click();
  await expect(page).toHaveURL(/\/checkout/);
}

export async function openCheckout(page: Page): Promise<void> {
  await page.goto("/checkout", { waitUntil: "domcontentloaded" });
}

export function checkoutLines(page: Page): Locator {
  return page.getByTestId("checkout-line");
}

export async function expectLine(
  page: Page,
  text: RegExp | string,
  quantity: number
): Promise<void> {
  await expect(checkoutLines(page)).toHaveCount(1);
  await expect(checkoutLines(page)).toContainText(text);
  await expect(checkoutLines(page)).toContainText(`${quantity} db`);
}

export async function increaseQuantity(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Mennyiség növelése" }).last().click();
}

export async function fillContactAndPickup(page: Page): Promise<void> {
  await page.getByPlaceholder("Név *").fill("Teszt Elek");
  await page.getByPlaceholder("Email cím *").fill("teszt@example.com");
  await page.getByRole("radio", { name: /Személyes átvétel/ }).check();
  await page.getByRole("checkbox").check();
}

export async function submitOrder(page: Page): Promise<void> {
  await page.getByRole("button", { name: /Leadom a rendelést/ }).click();
}

export async function expectOrderPlaced(page: Page): Promise<void> {
  await expect(page.getByTestId("order-code")).not.toBeEmpty();
}

export async function expectEmptyBasket(page: Page): Promise<void> {
  await expect(page.getByText("A kosarad üres.")).toBeVisible();
}

export async function openSecondTabOnCheckout(context: BrowserContext): Promise<Page> {
  const other = await context.newPage();

  await openCheckout(other);

  return other;
}

export async function expectInvalidLineBlocksSubmit(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
        return page.getByTestId("line-invalid-reason").count();
      },
      { timeout: 90_000 }
    )
    .toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: /Leadom a rendelést/ })).toBeDisabled();
}

export async function removeFirstLine(page: Page): Promise<void> {
  await checkoutLines(page)
    .first()
    .getByRole("button", { name: /Törlés/ })
    .click();
}
