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
  expectProductionNote,
  expectReviewPrefilled,
  expectSetChip,
  expectShippingRow,
  expectTotal,
  choosePayment,
  continueFromPayment,
  fillContact,
  fillPickupBilling,
  goToCheckoutInApp,
  increaseLineQuantity,
  lineOf,
  openCheckout,
  openPartnerLink,
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
  restoreLargeSize,
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
  await expectProductionNote(page, "Az elkészítési idő 3 hét.");

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

  // The payment choice is not saved onto the order, so a returning buyer is
  // re-asked on the Fizetés step; everything else is restored.
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/#payment$/);
  await choosePayment(page, /Átutalás/);
  await expectReviewPrefilled(page, "Kék legyen");
  await expectContactFieldsPrefilled(page);

  await openCheckout(page);
  await expect(page).toHaveURL(/#payment$/);
  await choosePayment(page, /Átutalás/);
  await expectReviewPrefilled(page, "Kék legyen");

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

  // The partner link carries the line's material, so the partner is added
  // without choosing it again.
  await openPartnerLink(page, /E2E Szett Fej/, /E2E Szett Láb/);
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

test("a pending Barion order pays again from the payment step", async ({ page }) => {
  await restoreLargeSize();
  await openProductFromList(page, /E2E Párna/);
  await chooseOption(page, /50x50/);
  await addToBasket(page);
  await goToCheckoutInApp(page);

  await fillContact(page);
  await chooseDelivery(page, /Személyes átvétel/);
  await continueFromShipping(page);
  await fillPickupBilling(page);
  await page.getByRole("button", { name: "Fizetés" }).click();
  await choosePayment(page, /Online fizetés/);
  await acceptTermsAndSubmit(page);

  // The wizard requests the intent and redirects to the fake gateway; the
  // navigation is cut off (the payment stays unfinished — the "buyer closed
  // the gateway page" case).
  await page.waitForURL(/secure\.test\.barion\.com/, { waitUntil: "commit" }).catch(() => {});

  const paymentId = new URL(page.url()).searchParams.get("t") ?? "";

  expect(paymentId).toContain("fake-payment-");

  // Coming back: the pending order is the basket, at the payment step only.
  await page.goto("/checkout");
  await expect(page).toHaveURL(/#payment$/);
  await expect(page.getByRole("radio", { name: /Átutalás/ })).toBeVisible();
  await expect(page.getByTestId("summary-column")).toContainText("E2E Párna");

  // The delivery step is not offered: the placed order's details are fixed,
  // and the delivery methods list is empty for a session without an active
  // order. The summary is read-only (no edit/delete on a placed order) and
  // has no review hint.
  await expect(page.getByRole("button", { name: "Szállítás" })).toHaveCount(0);
  await expect(
    page.getByTestId("summary-column").getByRole("button", { name: "Törlés" })
  ).toHaveCount(0);
  await expect(
    page.getByTestId("summary-column").getByRole("link", { name: "Szerkesztés" })
  ).toHaveCount(0);
  await expect(page.getByTestId("summary-column")).not.toContainText("Áttekintés");

  // Barion: a new intent starts and the gateway takes over again.
  await page.getByRole("radio", { name: /Online fizetés/ }).check();
  await continueFromPayment(page, /Fizetés most/);
  await page.waitForURL(/secure\.test\.barion\.com/, { waitUntil: "commit" }).catch(() => {});
  await expect(page).toHaveURL(/secure\.test\.barion\.com/);

  // Closing the gateway again leaves the order pending once more.
  await page.goto("/checkout");
  await expect(page).toHaveURL(/#payment$/);

  // Bank transfer: the switch closes the Barion track on the server (the
  // díjbekérő replaces it), then the code is shown.
  await page.getByRole("radio", { name: /Átutalás/ }).check();
  await continueFromPayment(page, /Fizetés most/);
  await expectOrderPlaced(page);

  // The switch is real: on reload the pending basket is gone — the checkout
  // starts fresh instead of resurrecting the order.
  await page.goto("/checkout");
  await expect(page).not.toHaveURL(/#payment$/);
  await expect(page.getByRole("radio", { name: /Átutalás/ })).toHaveCount(0);
});
