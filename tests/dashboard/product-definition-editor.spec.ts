import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  deleteDefinitionIfPresent,
  ensureMaterials,
  generatedTable,
  login,
  waitForMutation,
} from "./helpers";

/**
 * Browser-level e2e for the product-definition create and editor flows. The
 * stock products list's "Új konfigurátor termék" action-bar button opens
 * /product-definitions/new (the only editor route); after creating, the
 * dashboard lands on the generated native product's page, where the
 * "Konfigurátor" page block is the editor home and hosts delete. The editor
 * edits the canonical definition in its input shape and re-validates it with
 * the canonical schema on save; the server re-derives the native option
 * groups/variants via the queued sync, whose state the badge surfaces.
 *
 * The extension's labels are hardcoded Hungarian strings; the stock product
 * form around the block renders untranslated English ("Name", "Price"), which
 * is what keeps the two forms' labels apart. The fixture materials are
 * ensured through the admin API (helpers.ts) because the material specs
 * delete the seeded ones.
 */

// One choice, one toggle, two material fields (the forbidden pair needs two
// groups to be coverable), one input and one embroidery field: 2×2×2×2 = 16
// planned variants, of which the m1+m2 rule omits 8.
const E2E_MATERIALS = [
  { slug: "e2e-m1", label: "Gyapjú" },
  { slug: "e2e-m2", label: "Len" },
];

/** The nth field block of the editor (fields render in definition order). */
function fieldBlock(page: Page, index: number): Locator {
  return page.locator(".rounded.border.p-3").nth(index);
}

/** The material-picker select inside a field block: the comboboxes after the
 * block's Típus select, one per option row. A closed <select>'s options are
 * absent from the a11y tree, so filtering by the options' text matches
 * nothing — the position after the Típus select is the stable handle. */
function materialSelect(block: Locator, index: number): Locator {
  return block.getByRole("combobox").nth(1 + index);
}

test("the configurator product lifecycle: create, edit every field kind, delete", async ({
  page,
}) => {
  await test.step("login, ensure materials and open the create form", async () => {
    await login(page, "/products");
    await ensureMaterials(page, E2E_MATERIALS);
    await deleteDefinitionIfPresent(page, "e2e-f1");

    await page.getByRole("button", { name: "Új konfigurátor termék" }).click();
    await page.waitForURL("**/dashboard/product-definitions/new");
    await expect(
      page.getByText('Végleges: a natív termék slugja létrehozáskor ebből készül. Nem lehet "new".')
    ).toBeVisible();
  });

  await test.step("the literal 'new' id is refused client-side", async () => {
    await page.getByLabel("Azonosító").fill("new");
    // "Név" is the native product's name now (ADR 0011 decision 1); filling
    // it keeps the create's own required-fields check out of the way.
    await page.getByLabel("Név").first().fill("E2E F1");
    await page.getByRole("button", { name: "Létrehozás" }).click();

    await expect(page.getByText('Az azonosító nem lehet "new".')).toBeVisible();
    await expect(page).toHaveURL(/product-definitions\/new$/);
  });

  await test.step("saving an empty field renders the zod errors readably", async () => {
    await page.getByLabel("Azonosító").fill("e2e-f1");
    await page.getByRole("button", { name: "+ Választó mező" }).click();
    await page.getByRole("button", { name: "Létrehozás" }).click();

    await expect(page.getByText("fields.0.label.hu:")).toBeVisible();
    await expect(page.getByText("fields.0.options.0.label.hu:")).toBeVisible();
    await expect(
      page.getByText("Nem lehet üres, és nem kezdődhet vagy végződhet szóközzel").first()
    ).toBeVisible();
  });

  await test.step("fill fields of every kind and create the product", async () => {
    const alapar = page.getByLabel("Alapár (Ft)");
    await alapar.fill("15000");
    await alapar.blur();

    // Codes are generated from the labels (no manual Kód inputs): "Szín" →
    // "szin", "Kék" → "kek", so the SKU assertions below hold unchanged.
    const valaszto = fieldBlock(page, 0);
    await valaszto.getByLabel("Név").first().fill("Szín");
    await valaszto.getByLabel("Név").nth(1).fill("Kék");
    await valaszto.getByRole("button", { name: "+ Elem hozzáadása" }).click();
    await valaszto.getByLabel("Név").nth(2).fill("Piros");
    const pirosAr = valaszto.getByLabel("Ár (Ft)").nth(1);
    await pirosAr.fill("500");
    await pirosAr.blur();

    await page.getByRole("button", { name: "+ Kapcsoló mező" }).click();
    const kapcsolo = fieldBlock(page, 1);
    await kapcsolo.getByLabel("Név").first().fill("Ajándék csomagolás");
    const kapcsoloAr = kapcsolo.getByLabel("Ár ha bekapcsolva (Ft)");
    await kapcsoloAr.fill("1000");
    await kapcsoloAr.blur();

    await page.getByRole("button", { name: "+ Anyag mező" }).click();
    const kulso = fieldBlock(page, 2);
    await kulso.getByLabel("Név").first().fill("Külső anyag");
    await kulso.getByRole("button", { name: "+ Anyag hozzáadása" }).click();
    await materialSelect(kulso, 0).selectOption("e2e-m1");
    await kulso.getByRole("button", { name: "+ Anyag hozzáadása" }).click();
    await materialSelect(kulso, 1).selectOption("e2e-m2");
    const felar = kulso.getByLabel("Felár (Ft)").nth(1);
    await felar.fill("250");
    await felar.blur();

    await page.getByRole("button", { name: "+ Anyag mező" }).click();
    const belso = fieldBlock(page, 3);
    await belso.getByLabel("Név").first().fill("Belső anyag");
    await belso.getByRole("button", { name: "+ Anyag hozzáadása" }).click();
    await materialSelect(belso, 0).selectOption("e2e-m1");
    await belso.getByRole("button", { name: "+ Anyag hozzáadása" }).click();
    await materialSelect(belso, 1).selectOption("e2e-m2");

    await page.getByRole("button", { name: "+ Szabad szöveg mező" }).click();
    const felirat = fieldBlock(page, 4);
    await felirat.getByLabel("Név").first().fill("Felirat");

    await page.getByRole("button", { name: "+ Hímzés mező" }).click();
    const himzes = fieldBlock(page, 5);
    await himzes.getByLabel("Név").first().fill("Név hímzés");
    const szoAr = himzes.getByLabel("Ár / szó (Ft)");
    await szoAr.fill("300");
    await szoAr.blur();

    await page.getByRole("button", { name: "+ Kombináció hozzáadása" }).click();
    await page.getByLabel("Anyag 1").selectOption("e2e-m1");
    await page.getByLabel("Anyag 2").selectOption("e2e-m2");

    const create = waitForMutation(page, "mutation CreateProductDefinition");
    await page.getByRole("button", { name: "Létrehozás" }).click();
    await create;

    // The dashboard lands on the generated native product, whose configurator
    // block is now the editor home.
    await page.waitForURL(/\/dashboard\/products\/\d+$/);
  });

  await test.step("the sync settles and the generated variants carry the definition", async () => {
    // No pending assertion here: the batched sync settles in well under a
    // second, so the badge may already read synced by the time the block
    // loads. The pending transition is asserted after a save below, where
    // the mutation response pins it deterministically.
    await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });

    await page.reload();

    const generated = generatedTable(page);
    // 16 planned combinations minus the 8 the m1+m2 rule omits.
    await expect(generated.getByRole("row", { name: /Szín: / })).toHaveCount(8);
    await expect(
      generated.getByRole("row", { name: /Külső anyag: Gyapjú · Belső anyag: Len/ })
    ).toHaveCount(0);
    await expect(
      generated.getByRole("row", { name: /Külső anyag: Len · Belső anyag: Gyapjú/ })
    ).toHaveCount(0);

    const kek = generated.getByRole("row", {
      name: /Szín: Kék · Külső anyag: Gyapjú · Belső anyag: Gyapjú(?! ·)/,
    });
    await expect(kek).toContainText("e2e-f1--kek-nem-e2e-m1-e2e-m1");
    await expect(kek).toContainText("15000");

    const piros = generated.getByRole("row", {
      name: /Szín: Piros · Ajándék csomagolás · Külső anyag: Len · Belső anyag: Len(?! ·)/,
    });
    await expect(piros).toContainText("e2e-f1--piros-igen-e2e-m2-e2e-m2");
    await expect(piros).toContainText("16750");
  });

  await test.step("editing option rows and adding a field re-syncs on save", async () => {
    // The renamed option keeps its code: the variant name changes, the SKU
    // (built from codes) does not.
    await fieldBlock(page, 0).getByLabel("Név").nth(1).fill("Zafír");
    const pirosAr = fieldBlock(page, 0).getByLabel("Ár (Ft)").nth(1);
    await pirosAr.fill("700");
    await pirosAr.blur();

    const toggleAr = fieldBlock(page, 1).getByLabel("Ár ha bekapcsolva (Ft)");
    await toggleAr.fill("1200");
    await toggleAr.blur();

    await page.getByRole("button", { name: "+ Választó mező" }).click();
    const meret = fieldBlock(page, 6);
    await meret.getByLabel("Név").first().fill("Méret");
    await meret.getByLabel("Név").nth(1).fill("S");

    await page.getByLabel("Terméknév", { exact: true }).fill("E2E F1 átnevezve");

    const update = waitForMutation(page, "mutation UpdateProductDefinition");
    await page.getByRole("button", { name: "Frissítés", exact: true }).click();
    await update;

    await expect(page.getByText("Mentés sikeres — a szinkronizálás fut.")).toBeVisible();
    await expect(page.getByText("Szinkronizálás…")).toBeVisible();
    await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });

    await page.reload();

    await expect(page.getByLabel("Terméknév", { exact: true })).toHaveValue("E2E F1 átnevezve");

    const generated = generatedTable(page);
    await expect(generated.getByRole("row", { name: /Szín: / })).toHaveCount(8);

    const zafir = generated.getByRole("row", {
      name: /Szín: Zafír · Külső anyag: Gyapjú · Belső anyag: Gyapjú · Méret: S/,
    });
    await expect(zafir).toContainText("e2e-f1--kek-nem-e2e-m1-e2e-m1-s");
    await expect(zafir).toContainText("15000");

    const piros = generated.getByRole("row", {
      name: /Szín: Piros · Ajándék csomagolás · Külső anyag: Len · Belső anyag: Len · Méret: S/,
    });
    // 15000 base + Piros 700 (raised from 500 in this step) + toggle 1200
    // (raised from 1000) + Len 250 + S 0.
    await expect(piros).toContainText("17150");
  });

  await test.step("delete asks for confirmation and removes the native product", async () => {
    await page.getByRole("button", { name: "Törlés", exact: true }).click();

    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByText("Termék törlése")).toBeVisible();
    await expect(dialog.getByText("Biztosan törlöd a terméket: e2e-f1?")).toBeVisible();

    const deletion = waitForMutation(page, "mutation DeleteProductDefinition");
    await dialog.getByRole("button", { name: "Continue" }).click();
    await deletion;

    await page.waitForURL("**/dashboard/products");
    await expect(page.getByRole("row", { name: /E2E F1/ })).toHaveCount(0);
  });
});
