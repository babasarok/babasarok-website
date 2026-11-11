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

/** The desktop order summary; every step stays mounted, so lines also exist hidden elsewhere. */
function summary(page: Page): Locator {
  return page.getByTestId("summary-column");
}

export function checkoutLines(page: Page): Locator {
  return summary(page).getByTestId("checkout-line");
}

export function lineOf(page: Page, product: RegExp | string): Locator {
  return checkoutLines(page).filter({ hasText: product });
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

/** Quantity changes only through the line's configurator deep link (`?line=`). */
export async function increaseLineQuantity(page: Page, product: RegExp | string): Promise<void> {
  await lineOf(page, product)
    .getByRole("link", { name: /Szerkesztés/ })
    .click();
  await expect(page.getByRole("button", { name: /^Kosár frissítése$/ })).toBeVisible();
  await page.getByRole("button", { name: "Mennyiség növelése" }).last().click();
  await addToBasket(page);
  await goToCheckoutInApp(page);
}

export async function expectLineHighlight(page: Page, text: RegExp, on: boolean): Promise<void> {
  const line = lineOf(page, text);

  if (on) {
    await expect(line).toHaveClass(/ring-2/);
    return;
  }

  await expect(line).not.toHaveClass(/ring-2/);
}

function step(page: Page, id: "contact" | "shipping" | "billing" | "review"): Locator {
  return page.getByTestId(`step-${id}`);
}

function shopMutation(page: Page, name: string): Promise<unknown> {
  return page.waitForResponse(
    (response) =>
      response.url().includes("/shop-api") && !!response.request().postData()?.includes(name)
  );
}

export const BUYER = {
  lastName: "Teszt",
  firstName: "Elek",
  email: "teszt@example.com",
  phone: "+36301234567",
};

export async function fillContact(page: Page): Promise<void> {
  const contact = step(page, "contact");
  const saved = shopMutation(page, "setCustomerForOrder");

  await contact.getByLabel(/^Vezetéknév/).fill(BUYER.lastName);
  await contact.getByLabel(/^Keresztnév/).fill(BUYER.firstName);
  await contact.getByLabel(/^Email cím/).fill(BUYER.email);
  await contact.getByLabel(/^Telefonszám/).fill(BUYER.phone);
  await contact.getByRole("button", { name: /Tovább a szállításhoz/ }).click();
  await saved;
  await expect(page).toHaveURL(/#shipping$/);
}

export async function chooseDelivery(page: Page, method: RegExp): Promise<void> {
  const saved = shopMutation(page, "setOrderShippingMethod");

  await step(page, "shipping").getByRole("radio", { name: method }).check();
  await saved;
}

export async function continueFromShipping(page: Page): Promise<void> {
  await step(page, "shipping")
    .getByRole("button", { name: /Tovább a számlázáshoz/ })
    .click();
  await expect(page).toHaveURL(/#billing$/);
}

export async function fillPickupBilling(page: Page): Promise<void> {
  const billing = step(page, "billing");
  const saved = shopMutation(page, "setOrderBillingAddress");

  await billing.getByLabel(/^Név/).fill("Teszt Elek");
  await billing.getByLabel(/^Utca/).fill("Fő utca");
  await billing.getByLabel(/^Házszám/).fill("1");
  await billing.getByLabel(/^Irányítószám/).fill("3896");
  await billing.getByLabel(/^Város/).fill("Telkibánya");
  await billing.getByRole("button", { name: /Tovább az áttekintéshez/ }).click();
  await saved;
  await expect(page).toHaveURL(/#review$/);
}

/** Contact, personal pickup and the then mandatory billing address, ending on Áttekintés. */
export async function completeDetailsWithPickup(page: Page): Promise<void> {
  await fillContact(page);
  await chooseDelivery(page, /Személyes átvétel/);
  await continueFromShipping(page);
  await fillPickupBilling(page);
}

export async function writeMessage(page: Page, message: string): Promise<void> {
  const saved = shopMutation(page, "setOrderCustomFields");
  const field = step(page, "review").getByLabel(/^Üzenet/);

  await field.fill(message);
  await field.blur();
  await saved;
}

export async function acceptTermsAndSubmit(page: Page): Promise<void> {
  const review = step(page, "review");

  await review.getByRole("checkbox", { name: /Elfogadom/ }).check();
  await review.getByTestId("place-order").click();
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

export async function expectReviewPrefilled(page: Page, message: string): Promise<void> {
  await expect(page).toHaveURL(/#review$/);
  await expect(page.getByTestId("review-contact")).toContainText("Teszt Elek");
  await expect(page.getByTestId("review-contact")).toContainText(BUYER.email);
  await expect(page.getByTestId("review-contact")).toContainText(BUYER.phone);
  await expect(page.getByTestId("review-shipping")).toContainText("Személyes átvétel");
  await expect(page.getByTestId("review-billing")).toContainText("Fő utca 1, 3896 Telkibánya");
  await expect(step(page, "review").getByLabel(/^Üzenet/)).toHaveValue(message);
  await expect(step(page, "review").getByRole("checkbox", { name: /Elfogadom/ })).not.toBeChecked();
}

/** The restored values sit in the inputs themselves, not only in the review. */
export async function expectContactFieldsPrefilled(page: Page): Promise<void> {
  await page
    .getByTestId("review-contact")
    .getByRole("button", { name: /Módosítás/ })
    .click();

  const contact = step(page, "contact");

  await expect(contact.getByLabel(/^Vezetéknév/)).toHaveValue(BUYER.lastName);
  await expect(contact.getByLabel(/^Keresztnév/)).toHaveValue(BUYER.firstName);
  await expect(contact.getByLabel(/^Email cím/)).toHaveValue(BUYER.email);
  await expect(contact.getByLabel(/^Telefonszám/)).toHaveValue(BUYER.phone);
}

export async function expectDetailsEmpty(page: Page): Promise<void> {
  const contact = step(page, "contact");

  await expect(page).toHaveURL(/#contact$/);
  await expect(contact.getByLabel(/^Vezetéknév/)).toHaveValue("");
  await expect(contact.getByLabel(/^Keresztnév/)).toHaveValue("");
  await expect(contact.getByLabel(/^Email cím/)).toHaveValue("");
}

export async function expectBrowserBackReturnsToShipping(page: Page): Promise<void> {
  await page.goBack();
  await expect(page).toHaveURL(/#shipping$/);
  await expect(page.getByRole("heading", { name: "Szállítás", level: 2 })).toBeFocused();
}

export async function expectInvalidLineBlocksSubmit(page: Page): Promise<void> {
  await expect(summary(page).getByTestId("line-invalid-reason")).toBeVisible();
  await step(page, "review")
    .getByRole("checkbox", { name: /Elfogadom/ })
    .check();
  await expect(step(page, "review").getByTestId("place-order")).toBeDisabled();
}

export async function removeFirstLine(page: Page): Promise<void> {
  await checkoutLines(page)
    .first()
    .getByRole("button", { name: /Törlés/ })
    .click();
}

export async function chooseMaterial(page: Page, material: RegExp): Promise<void> {
  await chooseOption(page, material);
  await page.locator("button[aria-selected]").first().click();
}

export function setChips(page: Page): Locator {
  return summary(page).getByTestId("set-discount");
}

export async function expectSetChip(
  page: Page,
  title: string,
  instances: number,
  discount: RegExp
): Promise<void> {
  await expect(setChips(page)).toHaveCount(1);
  await expect(setChips(page)).toContainText(title);
  await expect(setChips(page)).toContainText(`${instances} példány`);
  await expect(setChips(page)).toContainText(discount);
}

export async function expectIncompleteSetChip(page: Page, title: string): Promise<void> {
  await expect(setChips(page)).toHaveCount(1);
  await expect(setChips(page)).toContainText(title);
  await expect(setChips(page)).toContainText("még nem teljes");
}

export async function expectNoSetChip(page: Page): Promise<void> {
  await expect(setChips(page)).toHaveCount(0);
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

export async function expectPartnerLink(
  page: Page,
  product: RegExp | string,
  partner: RegExp
): Promise<void> {
  await expect(
    lineOf(page, product).getByTestId("set-partner-link").filter({ hasText: partner })
  ).toBeVisible();
}

/** Follows the line's partner link; the partner page opens with the line's materials chosen. */
export async function openPartnerLink(
  page: Page,
  product: RegExp | string,
  partner: RegExp
): Promise<void> {
  await lineOf(page, product).getByTestId("set-partner-link").filter({ hasText: partner }).click();
  await expect(page.getByRole("button", { name: /^Kosárba$/ })).toBeVisible();
}

export async function expectPriceChangeNotice(page: Page, actual: RegExp): Promise<void> {
  await expect(checkoutLines(page)).toContainText(/megváltozott/);
  await expect(checkoutLines(page)).toContainText(actual);
}

export async function expectShippingRow(page: Page, text: RegExp): Promise<void> {
  await expect(summary(page).getByText("Szállítás", { exact: true }).locator("..")).toContainText(
    text
  );
}

export async function expectTotal(page: Page, total: RegExp): Promise<void> {
  await expect(summary(page).getByTestId("checkout-total")).toContainText(total);
}

export async function expectNoDeliveryChosen(page: Page): Promise<void> {
  const shipping = step(page, "shipping");

  await expect(
    shipping.getByRole("radio", { name: /GLS házhozszállítás előre/, includeHidden: true })
  ).not.toBeChecked();
  await expect(
    shipping.getByRole("radio", { name: /GLS házhozszállítás utánvéttel/, includeHidden: true })
  ).not.toBeChecked();
}
