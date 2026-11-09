import { expect, test } from "@playwright/test";
import {
  adminApi,
  CREATE_DEFINITION,
  CreatedDefinition,
  createManualProduct,
  DEFINITION_STATE,
  DefinitionState,
  deleteDefinitionIfPresent,
  login,
  nativeVariants,
  stockTable,
} from "./helpers";

/**
 * Browser-level e2e for the product-definition sync flow: the create mutation
 * returns before the native variant exists (the sync runs on the job queue,
 * drained by the worker the e2e server boots), the editor's badge settles on
 * synced, and the product carries exactly one variant however many options
 * its definition offers (ADR 0016).
 *
 * Whole-Forint prices are asserted in the stock variants table
 * (ForintMoneyStrategy precision 0, so a stored 15400 must not read 154.00).
 */

const SYNC_FIXTURE = {
  id: "e2e-s1",
  basePrice: 15_000,
  pricing: { kind: "unit" },
  fields: [
    {
      kind: "choice",
      id: "szin",
      label: { hu: "Szín" },
      presentation: "select",
      visibility: { kind: "always" },
      options: Array.from({ length: 15 }, (_, index) => ({
        id: `k${String(index + 1).padStart(2, "0")}`,
        label: { hu: `${index + 1}. változat` },
        price: index * 100,
      })),
    },
  ],
  forbiddenMaterialCombinations: [],
};

test("the async sync settles on one native variant", async ({ page }) => {
  let nativeProductId: number | null | undefined;

  await test.step("login, create the fixture and see the mutation return pending", async () => {
    await login(page, "/products");
    await deleteDefinitionIfPresent(page, "e2e-s1");
    const created = await adminApi(
      page,
      CREATE_DEFINITION,
      { definition: SYNC_FIXTURE, name: "E2E S1" },
      CreatedDefinition
    );

    // The mutation did not wait for the variants to be generated.
    expect(created.createProductDefinition.syncState).toBe("pending");

    const state = await adminApi(page, DEFINITION_STATE, { productId: "e2e-s1" }, DefinitionState);
    nativeProductId = state.productDefinition?.nativeProductId;

    if (nativeProductId === null || nativeProductId === undefined) {
      throw new Error("A létrehozott definícióhoz nem tartozik natív termék.");
    }
  });

  await test.step("the badge settles on synced", async () => {
    await page.goto(`/dashboard/products/${nativeProductId}`);
    // No pending assertion here: the one-variant sync settles in well under a
    // second, so the badge may already read synced by the time the block
    // loads. The async handoff is proven by the create response above.
    await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });
  });

  await test.step("the native product carries one variant and no option groups", async () => {
    const native = await nativeVariants(page, nativeProductId ?? 0);

    expect(native.optionGroups).toEqual([]);
    expect(native.variants).toEqual([expect.objectContaining({ sku: "e2e-s1", price: 15_000 })]);
  });

  await test.step("the stock variants table renders the price as whole Forints", async () => {
    // The dashboard formats through the server's money precision: 0 decimals
    // (whole Forints), never the two-decimal 154.00 a default strategy would
    // render. The fresh browser context uses the dashboard's default English
    // locale with the e2e channel's USD currency, so 15400 renders grouped as
    // "$15,400". The generated product hides the stock variants grid (the
    // configurator owns the page), so the check uses a manually created
    // product. The e2e database is fresh every run, so a fixed slug is safe.
    const manualProductId = await createManualProduct(page, "e2e-manual");
    await page.goto(`/dashboard/products/${manualProductId}`);

    const varianta = stockTable(page).getByRole("row", { name: /E2E Manual Variant/ });
    await expect(varianta).toContainText(/15[,\u00A0 ]?400/);
    await expect(varianta).not.toContainText("154.00");
  });
});
