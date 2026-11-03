import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";

export async function openProductFromList(page: Page, name: RegExp): Promise<void> {
  await page.goto("/product/", { waitUntil: "domcontentloaded" });
  await page.getByRole("link", { name }).first().click();
  await expect(page.getByRole("button", { name: /^Kosárba$/ })).toBeVisible();
}

export async function chooseOption(page: Page, name: RegExp): Promise<void> {
  await page.getByRole("button", { name }).click();
}

export async function addToBasket(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^(Kosárba|Kosár frissítése)$/ }).click();
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
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("line-invalid-reason")).toBeVisible();
  await expect(page.getByRole("button", { name: /Leadom a rendelést/ })).toBeDisabled();
}

export async function removeFirstLine(page: Page): Promise<void> {
  await checkoutLines(page)
    .first()
    .getByRole("button", { name: /Törlés/ })
    .click();
}

function shopMutation(page: Page, name: string): Promise<unknown> {
  return page.waitForResponse(
    (response) =>
      response.url().includes("/shop-api") && !!response.request().postData()?.includes(name)
  );
}

export async function fillDetailsAndWaitUntilSaved(page: Page): Promise<void> {
  const methodSaved = shopMutation(page, "setOrderShippingMethod");

  await page.getByRole("radio", { name: /Személyes átvétel/ }).check();
  await methodSaved;

  const saved = shopMutation(page, "setOrderCustomFields");

  await page.getByPlaceholder("Név *").fill("Teszt Elek");
  await page.getByPlaceholder("Email cím *").fill("teszt@example.com");
  await page.getByPlaceholder("Telefonszám").fill("+36301234567");
  await page.getByPlaceholder(/Írd meg ide/).fill("Kék legyen");
  await page.getByPlaceholder(/Írd meg ide/).blur();
  await saved;
}

export async function expectDetailsPrefilled(page: Page): Promise<void> {
  await expect(page.getByPlaceholder("Név *")).toHaveValue("Teszt Elek");
  await expect(page.getByPlaceholder("Email cím *")).toHaveValue("teszt@example.com");
  await expect(page.getByPlaceholder("Telefonszám")).toHaveValue("+36301234567");
  await expect(page.getByPlaceholder(/Írd meg ide/)).toHaveValue("Kék legyen");
  await expect(page.getByRole("radio", { name: /Személyes átvétel/ })).toBeChecked();
  await expect(page.getByRole("checkbox")).not.toBeChecked();
}

export async function expectDetailsEmpty(page: Page): Promise<void> {
  await expect(page.getByPlaceholder("Név *")).toHaveValue("");
  await expect(page.getByPlaceholder("Email cím *")).toHaveValue("");
  await expect(page.getByPlaceholder(/Írd meg ide/)).toHaveValue("");
  await expect(page.getByRole("radio", { name: /Személyes átvétel/ })).not.toBeChecked();
  await expect(page.getByRole("checkbox")).not.toBeChecked();
}

export async function acceptTermsAndSubmit(page: Page): Promise<void> {
  await page.getByRole("checkbox").check();
  await submitOrder(page);
}

export async function chooseMaterial(page: Page, material: RegExp): Promise<void> {
  await chooseOption(page, material);
  await page.locator("button[aria-selected]").first().click();
}

export function lineOf(page: Page, product: RegExp | string): Locator {
  return checkoutLines(page).filter({ hasText: product });
}

export async function expectSetSection(page: Page, title: string, discount: RegExp): Promise<void> {
  const section = page.getByTestId("set-discount");

  await expect(section).toHaveCount(1);
  await expect(section).toContainText(title);
  await expect(section).toContainText(discount);
  await expect(section).toContainText("E2E Szett Fej · 1 db");
  await expect(section).toContainText("E2E Szett Láb · 1 db");
}

export async function expectNoSetSection(page: Page): Promise<void> {
  await expect(page.getByTestId("set-discount")).toHaveCount(0);
}

export async function editLineMaterial(
  page: Page,
  product: RegExp | string,
  material: RegExp
): Promise<void> {
  await lineOf(page, product)
    .getByRole("link", { name: /Szerkesztés/ })
    .click();
  await expect(page.getByRole("button", { name: /^Kosár frissítése$/ })).toBeVisible();
  await chooseMaterial(page, material);
  await addToBasket(page);
  await goToCheckoutInApp(page);
}

export async function syncLineMaterial(page: Page, product: RegExp | string): Promise<void> {
  await lineOf(page, product)
    .getByRole("link", { name: /Anyag egyeztetése/ })
    .click();
  await expect(page.getByRole("button", { name: /^Kosár frissítése$/ })).toBeVisible();
  await page.getByRole("button", { name: /^Kosár frissítése$/ }).click();
  await expect(page.getByText("A termék a kosárban van.")).toBeVisible();
  await goToCheckoutInApp(page);
}

export async function expectPendingMaterial(
  page: Page,
  product: RegExp | string,
  setTitle: string
): Promise<void> {
  await expect(lineOf(page, product).getByTestId("line-set-state")).toContainText(
    `${setTitle}: egyeztesd az anyagot`
  );
}

export async function expectPriceChangeNotice(page: Page, actual: RegExp): Promise<void> {
  await expect(checkoutLines(page)).toContainText(/megváltozott/);
  await expect(checkoutLines(page)).toContainText(actual);
}

export async function chooseDelivery(page: Page, method: RegExp): Promise<void> {
  const saved = shopMutation(page, "setOrderShippingMethod");

  await page.getByRole("radio", { name: method }).check();
  await saved;
}

export async function expectShippingRow(page: Page, text: RegExp): Promise<void> {
  await expect(page.getByText("Szállítás", { exact: true }).locator("..")).toContainText(text);
}

export async function expectNoDeliveryChosen(page: Page): Promise<void> {
  await expect(page.getByRole("radio", { name: /GLS házhozszállítás előre/ })).not.toBeChecked();
  await expect(
    page.getByRole("radio", { name: /GLS házhozszállítás utánvéttel/ })
  ).not.toBeChecked();
}
