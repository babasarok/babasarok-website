import { expect, test } from "@playwright/test";
import {
  cardDragHandle,
  cardOrder,
  createCollection,
  createManualProduct,
  dragHandleOnto,
  login,
  tableCards,
  waitForMutation,
} from "./helpers";

/**
 * Browser-level e2e for the responsive dashboard tables (ADR 0013): below
 * 640px of table width every stock data table renders its rows as cards,
 * through our patches of `@vendure-io/ui`'s DataTable molecule and the
 * `@vendure/dashboard` bridge. The seam is those patches vs. the upstream
 * packages they modify: an upgrade that reshapes the molecule, the bridge's
 * row seam or the drag-and-drop wiring breaks the cards (or their feature
 * parity with the table) without failing the patch application itself.
 *
 * The UI language is English (the dashboard default in the e2e build); a run
 * token keeps retried attempts' fixtures apart.
 */

test.use({ viewport: { width: 365, height: 800 } });

const run = Date.now().toString(36);

test("a phone-width product list renders cards with the table's features", async ({ page }) => {
  const nameA = `E2E Cards A ${run}`;
  const nameB = `E2E Cards B ${run}`;

  await login(page, "/products");
  await createManualProduct(page, `e2e-cards-a-${run}`, nameA);
  await createManualProduct(page, `e2e-cards-b-${run}`, nameB);

  await test.step("the search narrows the cards to the fixtures", async () => {
    await page.getByPlaceholder(/Search/).fill(run);
    await expect(tableCards(page)).toHaveCount(2);
    await expect(page.locator('[data-slot="table-container"]')).toHaveCount(0);
  });

  await test.step("the sort control reorders the cards", async () => {
    await page.getByRole("combobox", { name: "Sort by" }).selectOption("slug");
    await expect.poll(() => cardOrder(page, [nameA, nameB])).toEqual([nameA, nameB]);
    await page.getByRole("button", { name: "Ascending" }).click();
    await expect.poll(() => cardOrder(page, [nameA, nameB])).toEqual([nameB, nameA]);
  });

  await test.step("selecting a card opens the bulk-action bar", async () => {
    await tableCards(page).first().getByRole("checkbox", { name: "Select row" }).click();
    await expect(page.getByText("1 selected")).toBeVisible();
    await page.getByRole("button", { name: "Reset selection" }).click();
  });

  await test.step("each card carries its row actions, and pagination stays", async () => {
    await expect(tableCards(page).first().getByTestId("dt-row-actions-trigger")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Pagination" })).toBeVisible();
  });

  await test.step("a wide frame switches back to the table", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(tableCards(page)).toHaveCount(0);
    await expect(page.getByRole("row").filter({ hasText: nameA })).toBeVisible();
  });
});

test("a phone-width collection list reorders cards by their drag handle", async ({ page }) => {
  const names = ["A", "B", "C"].map((letter) => `E2E Drag ${letter} ${run}`);

  await login(page, "/collections");

  for (const [index, name] of names.entries()) {
    await createCollection(page, name, `e2e-drag-${index}-${run}`);
  }

  await page.reload();
  await expect.poll(() => cardOrder(page, names)).toEqual(names);

  // A pointer drag: the phone's touch drag runs through the same pointer
  // sensor. (dnd-kit's keyboard drag works too, but on cards taller than half
  // the scroll pane its first arrow press scrolls instead of moving.)
  await test.step("dragging the first fixture's handle moves it below the second", async () => {
    const moved = waitForMutation(page, "MoveCollection");

    await dragHandleOnto(page, cardDragHandle(page, names[0]), cardDragHandle(page, names[1]));
    await moved;

    await expect.poll(() => cardOrder(page, names)).toEqual([names[1], names[0], names[2]]);
  });
});
