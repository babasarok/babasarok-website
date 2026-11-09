import { expect, test } from "@playwright/test";
import {
  adminApi,
  CREATE_DEFINITION,
  CreatedDefinition,
  DEFINITION_STATE,
  DefinitionState,
  deleteDefinitionIfPresent,
  expandCard,
  fieldCardById,
  login,
  nativeVariants,
  UpdatedVariant,
  waitForMutation,
} from "./helpers";

/**
 * Browser-level e2e for the stale-variant UX (ADR 0016): a generated
 * product's one variant hand-edited through the stock admin API shows the
 * stale badge with the difference listed, and the next configurator save
 * restores the planned variant and clears the badge.
 */

const STALE_FIXTURE = {
  id: "e2e-d1",
  basePrice: 15_000,
  pricing: { kind: "unit" },
  fields: [
    {
      kind: "choice",
      id: "szin",
      label: { hu: "Szín" },
      presentation: "select",
      visibility: { kind: "always" },
      options: [
        { id: "kek", label: { hu: "Kék" }, price: 0 },
        { id: "piros", label: { hu: "Piros" }, price: 500 },
      ],
    },
  ],
  forbiddenMaterialCombinations: [],
};

const HAND_EDIT_VARIANT = `mutation HandEditVariantE2E($input: UpdateProductVariantInput!) {
  updateProductVariant(input: $input) {
    id
  }
}`;

const STALE_BADGE = "Elavult — a következő mentés frissíti a változatot";

test("a hand-edited variant shows as stale until the next save restores it", async ({ page }) => {
  let nativeProductId = 0;

  await test.step("login and create the fixture through the admin API", async () => {
    await login(page, "/products");
    await deleteDefinitionIfPresent(page, "e2e-d1");
    await adminApi(
      page,
      CREATE_DEFINITION,
      { definition: STALE_FIXTURE, name: "E2E D1" },
      CreatedDefinition
    );

    const state = await adminApi(page, DEFINITION_STATE, { productId: "e2e-d1" }, DefinitionState);
    nativeProductId = state.productDefinition?.nativeProductId ?? 0;

    await page.goto(`/dashboard/products/${nativeProductId}`);
    await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(STALE_BADGE)).toHaveCount(0);
  });

  await test.step("hand-edit the variant price through the admin API", async () => {
    const { variants } = await nativeVariants(page, nativeProductId);
    const variant = variants.at(0);

    if (variant === undefined) {
      throw new Error("A generált terméknek nincs változata — a szinkronizálás nem futott le?");
    }

    await adminApi(
      page,
      HAND_EDIT_VARIANT,
      { input: { id: variant.id, price: 999 } },
      UpdatedVariant
    );
  });

  await test.step("the editor shows the stale badge and the difference", async () => {
    await page.goto(`/dashboard/products/${nativeProductId}`);
    await expect(page.getByText("Szinkronizálva")).toBeVisible();
    await expect(page.getByText(STALE_BADGE)).toBeVisible();
    await expect(page.getByText("Ár eltér: 999 → 15000")).toBeVisible();
  });

  await test.step("a save re-syncs, clears the badge and restores the base price", async () => {
    const szin = fieldCardById(page, "szin");
    await expandCard(szin);
    const pirosAr = szin.getByLabel("Ár (Ft)").nth(1);
    await pirosAr.fill("700");
    await pirosAr.blur();

    const update = waitForMutation(page, "mutation UpdateProductDefinition");
    await page.getByRole("button", { name: "Frissítés", exact: true }).click();
    await update;

    await expect(page.getByText("Mentés sikeres — a szinkronizálás fut.")).toBeVisible();
    await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(STALE_BADGE)).toHaveCount(0);

    expect((await nativeVariants(page, nativeProductId)).variants).toEqual([
      expect.objectContaining({ sku: "e2e-d1", price: 15_000 }),
    ]);
  });
});
