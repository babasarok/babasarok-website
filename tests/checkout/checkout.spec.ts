/**
 * Seam: the browser session (bearer token in localStorage, reload, in-app
 * navigation, a second tab) vs. the Vendure active order, and a cached product
 * page vs. the live catalog. Server verdicts (prices, line validity, set
 * allocation) are proven by backend tests; this only proves the wiring.
 */
import { expect, test } from "@playwright/test";
import {
  acceptTermsAndSubmit,
  addToBasket,
  chooseDelivery,
  chooseMaterial,
  chooseOption,
  editLineMaterial,
  expectDetailsEmpty,
  expectDetailsPrefilled,
  expectEmptyBasket,
  expectInvalidLineBlocksSubmit,
  expectLine,
  expectLineHighlight,
  expectNoDeliveryChosen,
  expectNoSetSection,
  expectPartnerLink,
  expectPendingMaterial,
  expectPriceChangeNotice,
  expectSetSection,
  expectShippingRow,
  checkoutLines,
  expectNavCount,
  expectOrderPlaced,
  fillContactAndPickup,
  fillDetailsAndWaitUntilSaved,
  goToCheckoutInApp,
  increaseQuantity,
  increaseQuantityOf,
  openCheckout,
  openProductFromList,
  openSecondTabOnCheckout,
  removeFirstLine,
  submitOrder,
  syncLineMaterial,
} from "./pages";
import {
  createDeliveryProduct,
  createPricedProduct,
  createProduct,
  createSet,
  raisePrice,
  SET_TITLE,
  withdrawLargeSize,
} from "./helpers";

test.beforeAll(async () => {
  await createProduct();
  await createPricedProduct();
  await createDeliveryProduct();
  await createSet();
});

test("product page to a placed order, surviving reload, navigation and a second tab", async ({
  page,
  context,
}) => {
  await openProductFromList(page, /E2E Párna/);
  await chooseOption(page, /50x50/);
  await addToBasket(page);
  await expectNavCount(page, 1);

  await goToCheckoutInApp(page);
  await expectLine(page, /50x50/, 1);
  await expectLine(page, /11\s?000\s?Ft/, 1);

  await increaseQuantity(page);
  await expectLine(page, /50x50/, 2);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expectLine(page, /50x50/, 2);

  const other = await openSecondTabOnCheckout(context);
  await expectLine(other, /50x50/, 2);
  await other.close();

  await fillContactAndPickup(page);
  await submitOrder(page);
  await expectOrderPlaced(page);

  await openCheckout(page);
  await expectEmptyBasket(page);
});

test("typed details stay on the unfinished basket and the next basket starts empty", async ({
  page,
}) => {
  await openProductFromList(page, /E2E Párna/);
  await chooseOption(page, /50x50/);
  await addToBasket(page);
  await goToCheckoutInApp(page);
  await expectDetailsEmpty(page);

  await fillDetailsAndWaitUntilSaved(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expectDetailsPrefilled(page);

  await page.goBack();
  await openCheckout(page);
  await expectDetailsPrefilled(page);

  await acceptTermsAndSubmit(page);
  await expectOrderPlaced(page);

  await openProductFromList(page, /E2E Párna/);
  await chooseOption(page, /50x50/);
  await addToBasket(page);
  await goToCheckoutInApp(page);
  await expectDetailsEmpty(page);
});

test("a line whose option was withdrawn is marked and blocks the order until removed", async ({
  page,
}) => {
  await openProductFromList(page, /E2E Párna/);
  await chooseOption(page, /50x50/);
  await addToBasket(page);
  await withdrawLargeSize();

  await openCheckout(page);
  await expectInvalidLineBlocksSubmit(page);
  await removeFirstLine(page);
  await expectEmptyBasket(page);
});

test("a set forms, breaks on a material mismatch and is restored by the one-click material sync", async ({
  page,
}) => {
  await openProductFromList(page, /E2E Szett Fej/);
  await chooseMaterial(page, /Alfa/);
  await addToBasket(page);
  await goToCheckoutInApp(page);
  await expectPartnerLink(page, /E2E Szett Fej/, /E2E Szett Láb/);
  await openProductFromList(page, /E2E Szett Láb/);
  await chooseMaterial(page, /Alfa/);
  await addToBasket(page);
  await goToCheckoutInApp(page);
  await expectSetSection(page, SET_TITLE, /1\s?000\s?Ft/);

  await editLineMaterial(page, /E2E Szett Láb/, /Béta/);
  await expectNoSetSection(page);
  await expectPendingMaterial(page, /E2E Szett Láb/, SET_TITLE);

  await syncLineMaterial(page, /E2E Szett Láb/);
  await expectSetSection(page, SET_TITLE, /1\s?000\s?Ft/);

  // Hovering the set card highlights its member lines; moving away clears it
  // and clicking pins the highlight.
  await page.getByTestId("set-discount").first().hover();
  await expectLineHighlight(page, /E2E Szett Fej/, true);
  await expectLineHighlight(page, /E2E Szett Láb/, true);
  await page.mouse.move(0, 0);
  await expectLineHighlight(page, /E2E Szett Fej/, false);
  await page.getByTestId("set-discount").first().click();
  await page.mouse.move(0, 0);
  await expectLineHighlight(page, /E2E Szett Fej/, true);

  // Two instances of one set: bumping both members forms a second discount
  // row, and the page must keep updating (a duplicate key here froze every
  // later update on the page — totals, quantity, delivery).
  await increaseQuantityOf(page, /E2E Szett Fej/);
  await increaseQuantityOf(page, /E2E Szett Láb/);
  const discounts = page.getByTestId("set-discount");

  await expect(discounts).toHaveCount(2);

  for (const row of await discounts.all()) {
    await expect(row).toContainText(SET_TITLE);
    await expect(row).toContainText(/1\s?000\s?Ft/);
    await expect(row).toContainText("E2E Szett Fej · 1 db");
    await expect(row).toContainText("E2E Szett Láb · 1 db");
  }

  await expect(checkoutLines(page).filter({ hasText: "E2E Szett Fej" })).toContainText("2 db");
  await expect(checkoutLines(page).filter({ hasText: "E2E Szett Láb" })).toContainText("2 db");
  await expect(page.getByTestId("checkout-total")).toContainText(/12\s?000\s?Ft/);
});

test("a price changed after adding shows the new unit price with a notice once the line is adjusted", async ({
  page,
}) => {
  await openProductFromList(page, /E2E Változó ár/);
  await addToBasket(page);
  await raisePrice();

  await openCheckout(page);
  await increaseQuantity(page);
  await expectLine(page, /2 db/, 2);
  await expectPriceChangeNotice(page, /6\s?000\s?Ft/);
});

test("each delivery method is priced, free delivery applies above the threshold and an emptied basket forgets the method", async ({
  page,
}) => {
  await openProductFromList(page, /E2E Szállítás/);
  await addToBasket(page);
  await goToCheckoutInApp(page);

  await chooseDelivery(page, /GLS házhozszállítás előre utalással/);
  await expectShippingRow(page, /2\s?500\s?Ft/);

  await chooseDelivery(page, /GLS házhozszállítás utánvéttel \(előleg szükséges\)/);
  await expectShippingRow(page, /3\s?500\s?Ft/);

  await increaseQuantity(page);
  await expectShippingRow(page, /Ingyenes/);

  await removeFirstLine(page);
  await expectEmptyBasket(page);
  await openProductFromList(page, /E2E Szállítás/);
  await addToBasket(page);
  await goToCheckoutInApp(page);
  await expectNoDeliveryChosen(page);
});
