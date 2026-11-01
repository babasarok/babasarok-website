import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import {
  adminApi,
  CREATE_DEFINITION,
  CreatedDefinition,
  DASHBOARD,
  deleteDefinitionIfPresent,
  deleteMaterialIfPresent,
  ensureMaterials,
  login,
  SEED_MATERIALS,
  waitForMutation,
} from "./helpers";

/**
 * Browser-level e2e for the Vendure dashboard's custom "Anyagok" section
 * (backend/src/dashboard/material/material.tsx), served by the site's Worker
 * at /dashboard (ADR 0008) against the API booted by
 * `pnpm -C backend run e2e:server`. The seed data and credentials are fixed
 * in backend/e2e.env / backend/scripts/e2e-server.ts — the Anyagok labels
 * below are the extension's hardcoded Hungarian strings; the Vendure-shell
 * strings ("Sign in", "Select Asset") are untranslated fallbacks that render
 * in English regardless of the dashboard's display language.
 *
 * Asset uploads go through the picker dialog's dropzone file input with
 * in-repo fixture images (tests/dashboard/fixtures); the asset server writes
 * to backend/assets on disk, so no external service is involved. The
 * material's borítókép (thumbnail) reuses the same picker and helper.
 */

/** A definition referencing e2e-vaszon, for the delete-refusal step below. */
const REFERENCING_FIXTURE = {
  id: "e2e-mat",
  label: "E2E Anyaghív",
  type: "kiegeszito",
  orderable: true,
  basePrice: 10_000,
  pricing: { kind: "unit" },
  fields: [
    {
      kind: "material",
      id: "anyag",
      label: "Anyag",
      options: [{ materialId: "e2e-vaszon", price: 0 }],
      colorCount: { kind: "fixed", count: 1 },
    },
  ],
  forbiddenMaterialCombinations: [],
};

/** Uploads a fixture through the open picker dialog and selects the new asset. */
async function uploadAndSelectAsset(page: Page, fixture: string): Promise<void> {
  const dialog = page.getByRole("dialog");
  await dialog.locator('input[type="file"]').setInputFiles(fixture);

  // The picker uploads on file selection; the refetched gallery shows the new
  // asset once the upload round-tripped.
  const assetName = path.basename(fixture);
  const card = dialog.locator("[data-asset-gallery] > div").filter({ hasText: assetName }).first();
  await card.waitFor();
  await card.getByRole("button").first().click();
  await dialog.getByRole("button", { name: "Select Asset" }).click();
}

test("the Anyagok section handles the material lifecycle", async ({ page }) => {
  await test.step("login through the dashboard", async () => {
    // Deep link to the list: unauthenticated access redirects to the login
    // form and back after signing in.
    await login(page, "/materials");

    // Retry-safety: a previous attempt leaves the seeds renamed/mutated or
    // deleted and its own materials behind; restore the seeded state and drop
    // the spec's own slugs so the creates below start clean. A leftover
    // definition referencing a seed would refuse the material's deletion, so
    // it goes first. Vászon is never renamed or deleted by this spec, and it
    // cannot be re-created through the API anyway (zero colors — the schema
    // requires at least one), so it is not dropped here.
    await deleteDefinitionIfPresent(page, "e2e-mat");
    await deleteMaterialIfPresent(page, "e2e-pamut");
    await deleteMaterialIfPresent(page, "e2e-filc");
    await deleteMaterialIfPresent(page, "e2e-tulipan");
    await ensureMaterials(page, SEED_MATERIALS);

    // The list mounted before the restore: reload so it shows the fixed state.
    await page.goto(`${DASHBOARD}/materials`);

    await expect(page.getByRole("button", { name: "Pamut" })).toBeVisible();
  });

  await test.step("the seeded materials are listed with their color counts", async () => {
    const pamut = page.getByRole("row", { name: /e2e-pamut/ });
    await expect(pamut).toContainText("Pamut");
    await expect(pamut).toContainText("1");

    const vaszon = page.getByRole("row", { name: /e2e-vaszon/ });
    await expect(vaszon).toContainText("Vászon");
    await expect(vaszon).toContainText("0");
  });

  await test.step("create a material with a hex color, content fields and a thumbnail", async () => {
    await page.goto(`${DASHBOARD}/materials/new`);
    // Fill the material fields before a color row exists: afterwards two
    // inputs are labelled "Név" (material + color row), and the material one
    // comes first in the DOM.
    await page.getByLabel("Azonosító").fill("e2e-filc");
    await page.getByLabel("Név").fill("Filc");
    await page.getByLabel("Alcím").fill("Puha, rugalmas");
    await page.getByLabel("Leírás").fill("Könnyű, jól varrható anyag.");

    await page.getByRole("button", { name: "+ Szín hozzáadása" }).click();
    await page.getByLabel("Kód", { exact: true }).fill("01");
    await page.getByLabel("Név").nth(1).fill("Kék");
    await page.getByLabel("Színkód választása", { exact: true }).fill("#4a90d9");

    // exact: the color row's "Kép választása" is a substring of the
    // thumbnail's "Borítókép választása".
    await page.getByRole("button", { name: "Borítókép választása", exact: true }).click();
    await uploadAndSelectAsset(page, "tests/dashboard/fixtures/e2e-blue.png");

    const create = waitForMutation(page, "mutation CreateMaterial");
    await page.getByRole("button", { name: "Létrehozás" }).click();
    await create;

    // Creation navigates to the detail page (whose URL carries the numeric
    // material id); a reload proves the content fields and thumbnail
    // round-tripped through the API.
    await page.waitForURL(/\/materials\/\d+$/);
    await page.reload();
    await expect(page.getByLabel("Alcím")).toHaveValue("Puha, rugalmas");
    await expect(page.getByLabel("Leírás")).toHaveValue("Könnyű, jól varrható anyag.");
    await expect(page.locator('img[src*="e2e-blue"]')).toHaveCount(1);

    await page.goto(`${DASHBOARD}/materials`);
    const filc = page.getByRole("row", { name: /e2e-filc/ });
    await expect(filc).toContainText("Filc");
    await expect(filc).toContainText("1");
  });

  await test.step("create a material with an uploaded image color", async () => {
    await page.goto(`${DASHBOARD}/materials/new`);
    await page.getByLabel("Azonosító").fill("e2e-tulipan");
    await page.getByLabel("Név").fill("Tulipán");

    await page.getByRole("button", { name: "+ Szín hozzáadása" }).click();
    await page.getByLabel("Kód", { exact: true }).fill("T1");
    await page.getByLabel("Név").nth(1).fill("Kék minta");
    await page.getByRole("button", { name: "Kép választása", exact: true }).click();
    await uploadAndSelectAsset(page, "tests/dashboard/fixtures/e2e-blue.png");

    const create = waitForMutation(page, "mutation CreateMaterial");
    await page.getByRole("button", { name: "Létrehozás" }).click();
    await create;

    await page.goto(`${DASHBOARD}/materials`);
    await expect(page.getByRole("row", { name: /e2e-tulipan/ })).toContainText("Tulipán");
  });

  await test.step("rename a material and verify persistence", async () => {
    await page.goto(`${DASHBOARD}/materials`);
    await page.getByRole("button", { name: "Pamut" }).click();

    const name = page.getByLabel("Név").first();
    await expect(name).toHaveValue("Pamut");
    await name.fill("Pamut II");

    const update = waitForMutation(page, "mutation UpdateMaterial");
    await page.getByRole("button", { name: "Mentés" }).click();
    await update;

    await page.reload();
    await expect(page.getByLabel("Név").first()).toHaveValue("Pamut II");
  });

  await test.step("add a color row to an existing material", async () => {
    await page.getByRole("button", { name: "+ Szín hozzáadása" }).click();
    // The existing row already has these labels; the row just added is last.
    await page.getByLabel("Kód", { exact: true }).last().fill("02");
    await page.getByLabel("Név").last().fill("Zöld");
    await page.getByLabel("Színkód választása", { exact: true }).last().fill("#22aa44");

    const update = waitForMutation(page, "mutation UpdateMaterial");
    await page.getByRole("button", { name: "Mentés" }).click();
    await update;

    await page.reload();
    await expect(page.getByRole("button", { name: "Sor törlése" })).toHaveCount(2);
  });

  await test.step("remove a color row from the material", async () => {
    // The seeded "Fehér" row is first: colors are sorted by position.
    await page.getByRole("button", { name: "Sor törlése" }).first().click();

    const update = waitForMutation(page, "mutation UpdateMaterial");
    await page.getByRole("button", { name: "Mentés" }).click();
    await update;

    await page.reload();
    await expect(page.getByRole("button", { name: "Sor törlése" })).toHaveCount(1);
    await expect(page.getByLabel("Név").nth(1)).toHaveValue("Zöld");
  });

  await test.step("change a color's image and verify the new asset persists", async () => {
    await page.getByRole("button", { name: "Kép választása", exact: true }).click();
    await uploadAndSelectAsset(page, "tests/dashboard/fixtures/e2e-red.png");

    const update = waitForMutation(page, "mutation UpdateMaterial");
    await page.getByRole("button", { name: "Mentés" }).click();
    await update;

    await page.reload();
    await expect(page.locator('img[src*="e2e-red"]')).toHaveCount(1);
    await expect(page.locator('img[src*="e2e-blue"]')).toHaveCount(0);
  });

  await test.step("delete the material through the double-click confirmation", async () => {
    await page.getByRole("button", { name: "Törlés", exact: true }).click();
    // The first click only arms the confirmation; the re-labelled button is
    // the one that actually deletes.
    const confirmed = page.getByRole("button", { name: "Biztos? Kattints újra" });
    const deletion = waitForMutation(page, "mutation DeleteMaterial");
    await confirmed.click();
    await deletion;

    await expect(page.getByRole("row", { name: /Pamut II/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Filc" })).toBeVisible();
  });

  await test.step("a material referenced by a product definition refuses deletion", async () => {
    // Retry-safety and cleanup in one: the fixture definition is removed if a
    // previous attempt left it behind, and again after this step.
    await deleteDefinitionIfPresent(page, "e2e-mat");
    await adminApi(page, CREATE_DEFINITION, { definition: REFERENCING_FIXTURE }, CreatedDefinition);

    await page.goto(`${DASHBOARD}/materials`);
    await page.getByRole("button", { name: "Vászon" }).click();
    await expect(page.getByRole("button", { name: "Törlés", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Törlés", exact: true }).click();
    await expect(page.getByRole("button", { name: "Biztos? Kattints újra" })).toBeVisible();

    const deletion = waitForMutation(page, "mutation DeleteMaterial");
    await page.getByRole("button", { name: "Biztos? Kattints újra" }).click();
    await deletion;

    // The refusal names the referencing definitions and resets the
    // confirmation — no dead end, no blind second delete.
    await expect(page.getByText("Az anyag nem törölhető")).toBeVisible();
    await expect(page.getByText("E2E Anyaghív")).toBeVisible();
    await expect(page.getByRole("button", { name: "Törlés", exact: true })).toBeVisible();

    await deleteDefinitionIfPresent(page, "e2e-mat");
  });
});
