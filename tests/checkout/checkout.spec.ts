/**
 * Seam: the browser session (bearer token in localStorage, reload, in-app
 * navigation, a second tab) vs. the Vendure active order, and a cached product
 * page vs. the live catalog. Server verdicts (prices, line validity, set
 * allocation) are proven by backend tests; this only proves the wiring.
 */
import { test } from "@playwright/test";
import {
  acceptTermsAndSubmit,
  addToBasket,
  chooseOption,
  expectDetailsEmpty,
  expectDetailsPrefilled,
  expectEmptyBasket,
  expectInvalidLineBlocksSubmit,
  expectLine,
  expectNavCount,
  expectOrderPlaced,
  fillContactAndPickup,
  fillDetailsAndWaitUntilSaved,
  goToCheckoutInApp,
  increaseQuantity,
  openCheckout,
  openProductFromList,
  openSecondTabOnCheckout,
  removeFirstLine,
  submitOrder,
} from "./pages";
import { createProduct, withdrawLargeSize } from "./helpers";

test.beforeAll(async () => {
  await createProduct();
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
