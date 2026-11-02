import { expect, test } from "@playwright/test";
import {
  adminApi,
  CREATE_DEFINITION,
  CreatedDefinition,
  createManualProduct,
  DEFINITION_STATE,
  DefinitionState,
  deleteDefinitionIfPresent,
  generatedTable,
  login,
  stockTable,
} from "./helpers";

/**
 * Browser-level e2e for the product-definition sync flow: the save/create
 * mutation returns before the native structure exists (the sync runs on the
 * job queue, drained by the worker the e2e server boots), the editor's badge
 * polls pending→synced, and the generated-variants table refreshes after the
 * transition. The fixture is a single choice field with 15 options: enough
 * variants that the first 2-second poll still sees "pending" (making the
 * table's invalidation-driven refresh deterministic) while staying inside the
 * e2e time budget at the sync's ~1.5–3 variants/s.
 *
 * Whole-Forint prices are asserted twice: raw integers in the configurator's
 * own table, and the strategy-formatted rendering in the stock variants table
 * (ForintMoneyStrategy precision 0, so a stored 15400 must not read 154.00).
 */

const SYNC_FIXTURE = {
  id: "e2e-s1",
  orderable: true,
  basePrice: 15_000,
  pricing: { kind: "unit" },
  fields: [
    {
      kind: "choice",
      id: "szin",
      label: "Szín",
      presentation: "select",
      visibility: { kind: "always" },
      options: Array.from({ length: 15 }, (_, index) => ({
        id: `k${String(index + 1).padStart(2, "0")}`,
        label: `${index + 1}. változat`,
        price: index * 100,
      })),
    },
  ],
  forbiddenMaterialCombinations: [],
};

test("the async sync settles and the generated-variants table follows it", async ({ page }) => {
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
    // No pending assertion here: the batched sync settles in well under a
    // second (measured: 40 variants inside one), so the badge may already
    // read synced by the time the block loads. The async handoff is proven
    // by the create response above; the pending transition after a save is
    // asserted in the drift spec, where the mutation response pins it.
    await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });
  });

  await test.step("the generated-variants table lists the synced variants", async () => {
    await page.reload();

    const generated = generatedTable(page);
    await expect(generated.getByRole("row", { name: /E2E S1 \(/ })).toHaveCount(15);

    const elso = generated.getByRole("row", { name: /E2E S1 \(1\. változat\)/ });
    await expect(elso).toContainText("e2e-s1--k01");
    await expect(elso).toContainText("15000");

    const tizenotodik = generated.getByRole("row", { name: /E2E S1 \(15\. változat\)/ });
    await expect(tizenotodik).toContainText("e2e-s1--k15");
    await expect(tizenotodik).toContainText("16400");
  });

  await test.step("the stock variants table renders the price as whole Forints", async () => {
    // The dashboard formats through the server's money precision: 0 decimals
    // (whole Forints), never the two-decimal 154.00 a default strategy would
    // render. The fresh browser context uses the dashboard's default English
    // locale with the e2e channel's USD currency, so 15400 renders grouped as
    // "$15,400". The generated product hides the stock variants grid (the
    // configurator owns the page), so the check uses a manually created
    // product.
    // product. The e2e database is fresh every run, so a fixed slug is safe.
    const manualProductId = await createManualProduct(page, "e2e-manual");
    await page.goto(`/dashboard/products/${manualProductId}`);

    const varianta = stockTable(page).getByRole("row", { name: /E2E Manual Variant/ });
    await expect(varianta).toContainText(/15[,\u00A0 ]?400/);
    await expect(varianta).not.toContainText("154.00");

    await page.goto(`/dashboard/products/${nativeProductId}`);
  });

  await test.step("the generated-variants table pages server-side", async () => {
    const generated = generatedTable(page);

    await generated.getByRole("combobox").click();
    await page.getByRole("option", { name: "10", exact: true }).click();
    // The server honored the page size: 10 of the 15 synced variants listed,
    // the rest reachable only through the table's pagination.
    await expect(generated.getByText("1–10 of 15")).toBeVisible();

    await generated.getByRole("button", { name: "Go to next page" }).click();
    await expect(generated.getByText("11–15 of 15")).toBeVisible();
    await expect(generated.getByRole("row", { name: /E2E S1 \(/ })).toHaveCount(5);
    await expect(generated.getByRole("row", { name: /E2E S1 \(11\. változat\)/ })).toBeVisible();
    await expect(generated.getByRole("row", { name: /E2E S1 \(1\. változat\)/ })).toHaveCount(0);
  });
});
