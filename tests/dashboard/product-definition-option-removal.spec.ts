import { expect, test } from "@playwright/test";
import { z } from "zod";
import {
  adminApi,
  CREATE_DEFINITION,
  CreatedDefinition,
  DEFINITION_STATE,
  DefinitionState,
  deleteDefinitionIfPresent,
  expandCard,
  fieldCardById,
  generatedTable,
  login,
  waitForMutation,
} from "./helpers";

/**
 * Browser-level e2e for the option-removal seam of the product-definition
 * sync: removing a choice option deletes it from the native option group
 * during the first save's sync (the sync must soft-delete the stale variants
 * first — Vendure reports NOT_DELETED on an option delete while active
 * variants still use it), a second save settles synced and never stale
 * (soft-deleted options must not count into the native state), and re-adding
 * the same option code syncs again. The native group is asserted through the
 * admin API because the generated-variants table cannot show an option that
 * no variant carries.
 */

const REMOVAL_FIXTURE = {
  id: "e2e-o1",
  orderable: true,
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

const NATIVE_OPTION_GROUPS = `query NativeOptionGroupsE2E($id: ID!) {
  product(id: $id) {
    optionGroups {
      code
      options {
        code
      }
    }
  }
}`;

const NativeOptionGroups = z.object({
  product: z
    .object({
      optionGroups: z.array(
        z.object({
          code: z.string(),
          options: z.array(z.object({ code: z.string() })),
        })
      ),
    })
    .nullable(),
});

test("removing a choice option deletes it natively and re-adding syncs again", async ({ page }) => {
  let nativeProductId: number | null | undefined;

  await test.step("login and create the fixture through the admin API", async () => {
    await login(page, "/products");
    await deleteDefinitionIfPresent(page, "e2e-o1");
    await adminApi(
      page,
      CREATE_DEFINITION,
      { definition: REMOVAL_FIXTURE, name: "E2E O1" },
      CreatedDefinition
    );

    const state = await adminApi(page, DEFINITION_STATE, { productId: "e2e-o1" }, DefinitionState);
    nativeProductId = state.productDefinition?.nativeProductId;

    if (nativeProductId === null || nativeProductId === undefined) {
      throw new Error("A létrehozott definícióhoz nem tartozik natív termék.");
    }
  });

  await test.step("the initial sync settles synced", async () => {
    await page.goto(`/dashboard/products/${nativeProductId}`);
    await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });
  });

  await test.step("removing the Piros option and saving deletes it from the native group", async () => {
    const card = fieldCardById(page, "szin");
    await expandCard(card);
    await card.getByRole("button", { name: "Sor törlése" }).nth(1).click();

    const update = waitForMutation(page, "mutation UpdateProductDefinition");
    await page.getByRole("button", { name: "Frissítés", exact: true }).click();
    await update;

    await expect(page.getByText("Mentés sikeres — a szinkronizálás fut.")).toBeVisible();
    await expect(page.getByText("Szinkronizálás…")).toBeVisible();
    await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });

    await page.reload();
    await expect(generatedTable(page).getByRole("row", { name: /Szín: / })).toHaveCount(1);

    const native = await adminApi(
      page,
      NATIVE_OPTION_GROUPS,
      { id: String(nativeProductId) },
      NativeOptionGroups
    );
    expect(native.product?.optionGroups).toEqual([{ code: "szin", options: [{ code: "kek" }] }]);
  });

  await test.step("a second save settles synced and never stale", async () => {
    const card = fieldCardById(page, "szin");
    await expandCard(card);
    // The save button is disabled while the editor is clean, so make the
    // smallest real change: the kept option's price. With Piros gone no row
    // carries data any more, so the grid starts name-only and the price
    // column needs the Részletek switch first.
    await card.getByRole("switch", { name: "Részletek" }).click();
    const kekAr = card.getByLabel("Ár (Ft)").nth(0);
    await kekAr.fill("100");
    await kekAr.blur();

    const update = waitForMutation(page, "mutation UpdateProductDefinition");
    await page.getByRole("button", { name: "Frissítés", exact: true }).click();
    await update;

    await expect(page.getByText("Szinkronizálás…")).toBeVisible();
    await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByText("Elavult — mentés csak a natív módosítások felülírásával lehetséges")
    ).toHaveCount(0);

    const native = await adminApi(
      page,
      NATIVE_OPTION_GROUPS,
      { id: String(nativeProductId) },
      NativeOptionGroups
    );
    expect(native.product?.optionGroups).toEqual([{ code: "szin", options: [{ code: "kek" }] }]);
  });

  await test.step("re-adding the same option code syncs it back into the native group", async () => {
    const card = fieldCardById(page, "szin");
    // Still expanded with the Részletek override on from the previous step.
    await card.getByRole("button", { name: "+ Opció hozzáadása" }).click();
    await card.getByLabel("Név").nth(2).fill("Piros");
    const pirosAr = card.getByLabel("Ár (Ft)").nth(1);
    await pirosAr.fill("500");
    await pirosAr.blur();

    const update = waitForMutation(page, "mutation UpdateProductDefinition");
    await page.getByRole("button", { name: "Frissítés", exact: true }).click();
    await update;

    await expect(page.getByText("Szinkronizálás…")).toBeVisible();
    await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });

    await page.reload();
    await expect(generatedTable(page).getByRole("row", { name: /Szín: / })).toHaveCount(2);

    const native = await adminApi(
      page,
      NATIVE_OPTION_GROUPS,
      { id: String(nativeProductId) },
      NativeOptionGroups
    );
    expect(native.product?.optionGroups).toEqual([
      { code: "szin", options: [{ code: "kek" }, { code: "piros" }] },
    ]);
  });
});

test("removing a whole variant-axis field deletes its native group and resyncs", async ({
  page,
}) => {
  let nativeProductId: number | null | undefined;

  const wholeFieldFixture = {
    id: "e2e-o2",
    orderable: true,
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
      {
        kind: "choice",
        id: "meret",
        label: { hu: "Méret" },
        presentation: "select",
        visibility: { kind: "always" },
        options: [
          { id: "kicsi", label: { hu: "Kicsi" }, price: 0 },
          { id: "nagy", label: { hu: "Nagy" }, price: 0 },
        ],
      },
    ],
    forbiddenMaterialCombinations: [],
  };

  await test.step("login and create the two-field fixture through the admin API", async () => {
    await login(page, "/products");
    await deleteDefinitionIfPresent(page, "e2e-o2");
    await adminApi(
      page,
      CREATE_DEFINITION,
      { definition: wholeFieldFixture, name: "E2E O2" },
      CreatedDefinition
    );

    const state = await adminApi(page, DEFINITION_STATE, { productId: "e2e-o2" }, DefinitionState);
    nativeProductId = state.productDefinition?.nativeProductId;

    if (nativeProductId === null || nativeProductId === undefined) {
      throw new Error("A létrehozott definícióhoz nem tartozik natív termék.");
    }
  });

  await test.step("the initial sync settles synced", async () => {
    await page.goto(`/dashboard/products/${nativeProductId}`);
    await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });
  });

  await test.step("removing the Méret field and saving deletes its native group", async () => {
    await fieldCardById(page, "meret").getByRole("button", { name: "Mező törlése" }).click();

    const update = waitForMutation(page, "mutation UpdateProductDefinition");
    await page.getByRole("button", { name: "Frissítés", exact: true }).click();
    await update;

    await expect(page.getByText("Szinkronizálás…")).toBeVisible();
    await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });

    await page.reload();
    await expect(generatedTable(page).getByRole("row", { name: /Szín: / })).toHaveCount(2);

    const native = await adminApi(
      page,
      NATIVE_OPTION_GROUPS,
      { id: String(nativeProductId) },
      NativeOptionGroups
    );
    expect(native.product?.optionGroups).toEqual([
      { code: "szin", options: [{ code: "kek" }, { code: "piros" }] },
    ]);
  });

  await test.step("a second save settles synced and never stale", async () => {
    // The save button is disabled while the editor is clean, so make the
    // smallest real change: the first option's price.
    const card = fieldCardById(page, "szin");
    await expandCard(card);
    const kekAr = card.getByLabel("Ár (Ft)").nth(0);
    await kekAr.fill("100");
    await kekAr.blur();

    const update = waitForMutation(page, "mutation UpdateProductDefinition");
    await page.getByRole("button", { name: "Frissítés", exact: true }).click();
    await update;

    await expect(page.getByText("Szinkronizálás…")).toBeVisible();
    await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });
    await expect(
      page.getByText("Elavult — mentés csak a natív módosítások felülírásával lehetséges")
    ).toHaveCount(0);
  });
});
