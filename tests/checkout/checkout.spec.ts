/**
 * Seam: the browser session (bearer token in localStorage, reload, in-app
 * navigation, a second tab, browser history) vs. the Vendure active order —
 * the checkout wizard keeps no state of its own, so every restored value here
 * proves a save reached the order. A cached product page vs. the live catalog
 * is covered by the stale-price journey. Server verdicts (prices, line
 * validity, set allocation) are proven by backend tests; this only proves the
 * wiring.
 */
import { expect, test } from "@playwright/test";
import {
  acceptTermsAndSubmit,
  addToBasket,
  chooseDelivery,
  chooseMaterial,
  chooseOption,
  completeDetailsWithPickup,
  continueFromShipping,
  editLineMaterial,
  expectBrowserBackReturnsToShipping,
  expectContactFieldsPrefilled,
  expectDetailsEmpty,
  expectEmptyBasket,
  expectIncompleteSetChip,
  expectInvalidLineBlocksSubmit,
  expectLine,
  expectLineHighlight,
  expectNavCount,
  expectNoDeliveryChosen,
  expectOrderPlaced,
  expectPartnerLink,
  expectPendingMaterial,
  expectPriceChangeNotice,
  expectReviewPrefilled,
  expectSetChip,
  expectShippingRow,
  expectTotal,
  fillContact,
  fillPickupBilling,
  goToCheckoutInApp,
  increaseLineQuantity,
  lineOf,
  openCheckout,
  openProductFromList,
  openSecondTabOnCheckout,
  removeFirstLine,
  setChips,
  syncLineMaterial,
  writeMessage,
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

  await increaseLineQuantity(page, /E2E Párna/);
  await expectLine(page, /50x50/, 2);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expectLine(page, /50x50/, 2);

  const other = await openSecondTabOnCheckout(context);
  await expectLine(other, /50x50/, 2);
  await other.close();

  await completeDetailsWithPickup(page);
  await acceptTermsAndSubmit(page);
  await expectOrderPlaced(page);

  await openCheckout(page);
  await expectEmptyBasket(page);
});

test("every step's details are saved onto the order, restored on return, and the next basket starts empty", async ({
  page,
}) => {
  await openProductFromList(page, /E2E Párna/);
  await chooseOption(page, /50x50/);
  await addToBasket(page);
  await goToCheckoutInApp(page);
  await expectDetailsEmpty(page);

  await fillContact(page);
  await chooseDelivery(page, /Személyes átvétel/);
  await continueFromShipping(page);
  await expectBrowserBackReturnsToShipping(page);
  await continueFromShipping(page);
  await fillPickupBilling(page);
  await writeMessage(page, "Kék legyen");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expectReviewPrefilled(page, "Kék legyen");

  await page.goBack();
  await openCheckout(page);
  await expectReviewPrefilled(page, "Kék legyen");
  await expectContactFieldsPrefilled(page);

  await openCheckout(page);
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
  await completeDetailsWithPickup(page);
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
  await expectIncompleteSetChip(page, SET_TITLE);

  await openProductFromList(page, /E2E Szett Láb/);
  await chooseMaterial(page, /Alfa/);
  await addToBasket(page);
  await goToCheckoutInApp(page);
  await expectSetChip(page, SET_TITLE, 1, /1\s?000\s?Ft/);

  await editLineMaterial(page, /E2E Szett Láb/, /Béta/);
  await expectPendingMaterial(page, /E2E Szett Láb/, SET_TITLE);
  await expectIncompleteSetChip(page, SET_TITLE);

  await syncLineMaterial(page, /E2E Szett Láb/);
  await expectSetChip(page, SET_TITLE, 1, /1\s?000\s?Ft/);

  // Hovering the set chip highlights its member lines; moving away clears it
  // and clicking pins the highlight.
  await setChips(page).first().hover();
  await expectLineHighlight(page, /E2E Szett Fej/, true);
  await expectLineHighlight(page, /E2E Szett Láb/, true);
  await page.mouse.move(0, 0);
  await expectLineHighlight(page, /E2E Szett Fej/, false);
  await setChips(page).first().click();
  await page.mouse.move(0, 0);
  await expectLineHighlight(page, /E2E Szett Fej/, true);

  // Two instances of one set stay one chip per set, never one per instance,
  // and the page keeps updating (a duplicate key here once froze every later
  // update on the page — totals, quantity, delivery).
  await increaseLineQuantity(page, /E2E Szett Fej/);
  await increaseLineQuantity(page, /E2E Szett Láb/);
  await expectSetChip(page, SET_TITLE, 2, /2\s?000\s?Ft/);
  await expect(lineOf(page, /E2E Szett Fej/)).toContainText("2 db");
  await expect(lineOf(page, /E2E Szett Láb/)).toContainText("2 db");
  await expectTotal(page, /12\s?000\s?Ft/);
});

test("a price raised while the product page was open shows the server price with a notice", async ({
  page,
}) => {
  await openProductFromList(page, /E2E Változó ár/);
  await raisePrice();
  await addToBasket(page);

  await openCheckout(page);
  await expectLine(page, /1 db/, 1);
  await expectPriceChangeNotice(page, /6\s?000\s?Ft/);
});

test("each delivery method is priced, free delivery applies above the threshold and an emptied basket forgets the method", async ({
  page,
}) => {
  await openProductFromList(page, /E2E Szállítás/);
  await addToBasket(page);
  await goToCheckoutInApp(page);
  await fillContact(page);

  await chooseDelivery(page, /GLS házhozszállítás előre utalással/);
  await expectShippingRow(page, /2\s?500\s?Ft/);

  await chooseDelivery(page, /GLS házhozszállítás utánvéttel \(előleg szükséges\)/);
  await expectShippingRow(page, /3\s?500\s?Ft/);

  await increaseLineQuantity(page, /E2E Szállítás/);
  await expectShippingRow(page, /Ingyenes/);

  await removeFirstLine(page);
  await expectEmptyBasket(page);
  await openProductFromList(page, /E2E Szállítás/);
  await addToBasket(page);
  await goToCheckoutInApp(page);
  await expectNoDeliveryChosen(page);
});
