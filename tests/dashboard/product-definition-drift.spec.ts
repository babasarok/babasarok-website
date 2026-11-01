import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  adminApi,
  CreatedDefinition,
  DefinitionState,
  GeneratedVariants,
  login,
  UpdatedVariant,
  waitForMutation,
} from "./helpers";

/**
 * Browser-level e2e for the drift UX (ADR 0010): after the sync settles, a
 * variant hand-edited through the stock admin API makes the next save refused
 * with PRODUCT_DEFINITION_NATIVE_DRIFT, the editor surfaces the destructive
 * alert with a force button, and forcing re-syncs (overwriting the hand edit)
 * and clears the stale badge. The editor is the "Konfigurátor" page block on
 * the stock product-detail page; the fixture is created through the admin
 * API (helpers.ts).
 *
 * The hand edit targets a variant price because that is what the sync owns
 * end to end: variant names of existing variants are never rewritten, so a
 * hand-edited name would survive the force re-sync and a renamed product
 * label would leave the definition stale for reasons the sync cannot fix.
 */

const CREATE_DEFINITION = `mutation CreateProductDefinitionE2E($definition: JSON!) {
  createProductDefinition(definition: $definition) {
    productId
  }
}`;

const DEFINITION_STATE = `query ProductDefinitionE2E($productId: String!) {
  productDefinition(productId: $productId) {
    nativeProductId
  }
}`;

const GENERATED_VARIANTS = `query GeneratedVariantsE2E($productDefinitionId: String!, $options: GeneratedVariantListOptions!) {
  generatedVariants(productDefinitionId: $productDefinitionId, options: $options) {
    items {
      id
      name
    }
  }
}`;

const HAND_EDIT_VARIANT = `mutation HandEditVariantE2E($input: UpdateProductVariantInput!) {
  updateProductVariant(input: $input) {
    id
  }
}`;

const DRIFT_FIXTURE = {
  id: "e2e-d1",
  label: "E2E D1",
  type: "kiegeszito",
  orderable: true,
  basePrice: 15_000,
  pricing: { kind: "unit" },
  fields: [
    {
      kind: "choice",
      id: "szin",
      label: "Szín",
      presentation: "select",
      price: 0,
      visibility: { kind: "always" },
      options: [
        { id: "kek", label: "Kék", price: 0 },
        { id: "piros", label: "Piros", price: 500 },
      ],
    },
  ],
  forbiddenMaterialCombinations: [],
};

/** The configurator's generated-variants table (its Hungarian price column
 * keeps it apart from the stock variants table on the same page). */
function generatedTable(page: Page): Locator {
  return page
    .locator('[data-slot="data-table"]')
    .filter({ has: page.getByRole("columnheader", { name: "Ár (Ft)" }) });
}

/** The stock product page's own variants table (Money-formatted prices). */
function stockTable(page: Page): Locator {
  return page
    .locator('[data-slot="data-table"]')
    .filter({ has: page.getByRole("columnheader", { name: "Price" }) });
}

test("a natively hand-edited variant price is refused until the force re-sync", async ({
  page,
}) => {
  let nativeProductId: number | null | undefined;

  await test.step("login and create the fixture through the admin API", async () => {
    await login(page, "/products");
    await adminApi(page, CREATE_DEFINITION, { definition: DRIFT_FIXTURE }, CreatedDefinition);
  });

  await test.step("a saved option-price edit re-syncs into the variant prices", async () => {
    const state = await adminApi(page, DEFINITION_STATE, { productId: "e2e-d1" }, DefinitionState);
    nativeProductId = state.productDefinition?.nativeProductId;

    if (nativeProductId === null || nativeProductId === undefined) {
      throw new Error("A létrehozott definícióhoz nem tartozik natív termék.");
    }

    await page.goto(`/dashboard/products/${nativeProductId}`);
    await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });

    const pirosAr = page.locator(".rounded.border.p-3").first().getByLabel("Ár (Ft)").nth(1);
    await pirosAr.fill("700");
    await pirosAr.blur();

    const update = waitForMutation(page, "mutation UpdateProductDefinition");
    await page.getByRole("button", { name: "Mentés", exact: true }).click();
    await update;

    await expect(page.getByText("Mentés sikeres — a szinkronizálás fut.")).toBeVisible();
    // The badge flips to pending in the same render as the success alert; the
    // poll flips it back no earlier than its first 2-second tick.
    await expect(page.getByText("Szinkronizálás…")).toBeVisible();
    await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });

    await page.reload();

    const generated = generatedTable(page);
    await expect(generated.getByRole("row", { name: /E2E D1 \(Kék\)/ })).toContainText("15000");
    await expect(generated.getByRole("row", { name: /E2E D1 \(Piros\)/ })).toContainText("15700");
  });

  await test.step("hand-edit a variant price through the admin API", async () => {
    const variants = await adminApi(
      page,
      GENERATED_VARIANTS,
      { productDefinitionId: "e2e-d1", options: { skip: 0, take: 10 } },
      GeneratedVariants
    );
    const kek = variants.generatedVariants.items.find((variant) => variant.name.endsWith("(Kék)"));

    if (kek === undefined) {
      throw new Error("Nincs (Kék) változat — a szinkronizálás nem futott le?");
    }

    await adminApi(page, HAND_EDIT_VARIANT, { input: { id: kek.id, price: 999 } }, UpdatedVariant);
  });

  await test.step("the editor shows the stale badge next to the synced state", async () => {
    await page.goto(`/dashboard/products/${nativeProductId}`);
    await expect(page.getByText("Szinkronizálva")).toBeVisible();
    await expect(page.getByText("Elavult — mentéskor újraszinkronizálódik")).toBeVisible();
  });

  await test.step("a save is refused with the drift alert and the force button", async () => {
    const refused = waitForMutation(page, "mutation UpdateProductDefinition");
    await page.getByRole("button", { name: "Mentés", exact: true }).click();
    await refused;

    await expect(
      page.getByText(
        "A natív termék opciói, változatai vagy árai a szinkronizáláson kívül módosultak."
      )
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Natív módosítások felülírása (force)" })
    ).toBeVisible();
    await expect(page.getByText("termék natív adatai")).toBeVisible();
    await expect(page.getByText("Mentés sikeres — a szinkronizálás fut.")).toHaveCount(0);
  });

  await test.step("forcing re-syncs, clears the stale badge and overwrites the hand edit", async () => {
    const forced = waitForMutation(page, "mutation UpdateProductDefinition");
    await page.getByRole("button", { name: "Natív módosítások felülírása (force)" }).click();
    await forced;

    await expect(page.getByText("Szinkronizálás…")).toBeVisible();
    await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("Elavult — mentéskor újraszinkronizálódik")).toHaveCount(0);

    await page.reload();

    const generated = generatedTable(page);
    const kek = generated.getByRole("row", { name: /E2E D1 \(Kék\)/ });
    await expect(kek).toContainText("15000");
    await expect(kek).not.toContainText("999");

    // The forced sync wrote the whole-Forint price back; the stock table
    // renders it through the money strategy (0 decimals, English grouping in
    // the fresh browser context).
    const stockKek = stockTable(page).getByRole("row", { name: /E2E D1 \(Kék\)/ });
    await expect(stockKek).toContainText(/15[,\u00A0 ]?000/);
    await expect(stockKek).not.toContainText("150.00");
  });
});
