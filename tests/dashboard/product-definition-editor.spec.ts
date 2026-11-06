import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  CREATE_DEFINITION,
  CreatedDefinition,
  DEFINITION_STATE,
  DefinitionState,
  adminApi,
  deleteDefinitionIfPresent,
  ensureMaterials,
  expandCard,
  fieldCard,
  fieldCardById,
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
 * Each field renders as a card (`data-testid="field-card"`) that starts
 * collapsed after every load: the header chevron opens the Alap /
 * Beállítások / Speciális sections, and a per-card "Részletek" switch flips
 * the option grids between name-only and fully detailed rows (it turns on by
 * itself for load-bearing fields and fields whose rows carry data). The
 * extension's labels are hardcoded Hungarian strings; the stock product form
 * around the block renders untranslated English ("Name", "Price"), which is
 * what keeps the two forms' labels apart. The fixture materials are ensured
 * through the admin API (helpers.ts) because the material specs delete the
 * seeded ones.
 */

// One choice, one toggle, two material fields (the forbidden pair needs two
// groups to be coverable), one input and one embroidery field: 2×2×2×2 = 16
// planned variants, of which the m1+m2 rule omits 8.
const E2E_MATERIALS = [
  { slug: "e2e-m1", label: "Gyapjú" },
  { slug: "e2e-m2", label: "Len" },
];

/** The material-picker select inside a material field card's option rows. */
function materialSelect(card: Locator, index: number): Locator {
  return card.getByLabel("Anyag").nth(index);
}

interface FixtureDefinition {
  id: string;
  orderable: boolean;
  basePrice: number;
  pricing: { kind: "unit" } | { kind: "length"; sourceFieldId: string };
  fields: Array<
    | {
        kind: "choice";
        id: string;
        label: { hu: string };
        presentation: "select" | "radio" | "color";
        visibility: { kind: "always" };
        options: Array<{ id: string; label: { hu: string }; price: number }>;
      }
    | {
        kind: "input";
        id: string;
        label: { hu: string };
        visibility: { kind: "always" };
        required: boolean;
        price: number;
      }
  >;
  forbiddenMaterialCombinations: Array<string[]>;
}

/** Creates a definition fixture through the admin API and opens the
 * generated native product's configurator block after the sync settles. */
async function openFixture(page: Page, definition: FixtureDefinition, name: string): Promise<void> {
  await deleteDefinitionIfPresent(page, definition.id);
  await adminApi(page, CREATE_DEFINITION, { definition, name }, CreatedDefinition);

  const state = await adminApi(
    page,
    DEFINITION_STATE,
    { productId: definition.id },
    DefinitionState
  );
  const nativeProductId = state.productDefinition?.nativeProductId;

  if (nativeProductId === null || nativeProductId === undefined) {
    throw new Error("A létrehozott definícióhoz nem tartozik natív termék.");
  }

  await page.goto(`/dashboard/products/${nativeProductId}`);
  await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });
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
    const valaszto = fieldCard(page, 0);
    await valaszto.getByLabel("Név").first().fill("Szín");
    await valaszto.getByLabel("Név").nth(1).fill("Kék");
    await valaszto.getByRole("button", { name: "+ Elem hozzáadása" }).click();
    await valaszto.getByLabel("Név").nth(2).fill("Piros");
    // The option grid starts name-only; the Részletek switch reveals the
    // price column so the Piros surcharge can be entered.
    await valaszto.getByRole("switch", { name: "Részletek" }).click();
    const pirosAr = valaszto.getByLabel("Ár (Ft)").nth(1);
    await pirosAr.fill("500");
    await pirosAr.blur();

    await page.getByRole("button", { name: "+ Kapcsoló mező" }).click();
    const kapcsolo = fieldCard(page, 1);
    await kapcsolo.getByLabel("Név").first().fill("Ajándék csomagolás");
    const kapcsoloAr = kapcsolo.getByLabel("Ár ha bekapcsolva (Ft)");
    await kapcsoloAr.fill("1000");
    await kapcsoloAr.blur();

    await page.getByRole("button", { name: "+ Anyag mező" }).click();
    const kulso = fieldCard(page, 2);
    await kulso.getByLabel("Név").first().fill("Külső anyag");
    await kulso.getByRole("button", { name: "+ Anyag hozzáadása" }).click();
    await materialSelect(kulso, 0).selectOption("e2e-m1");
    await kulso.getByRole("button", { name: "+ Anyag hozzáadása" }).click();
    await materialSelect(kulso, 1).selectOption("e2e-m2");
    await kulso.getByRole("switch", { name: "Részletek" }).click();
    const felar = kulso.getByLabel("Felár (Ft)").nth(1);
    await felar.fill("250");
    await felar.blur();

    await page.getByRole("button", { name: "+ Anyag mező" }).click();
    const belso = fieldCard(page, 3);
    await belso.getByLabel("Név").first().fill("Belső anyag");
    await belso.getByRole("button", { name: "+ Anyag hozzáadása" }).click();
    await materialSelect(belso, 0).selectOption("e2e-m1");
    await belso.getByRole("button", { name: "+ Anyag hozzáadása" }).click();
    await materialSelect(belso, 1).selectOption("e2e-m2");

    await page.getByRole("button", { name: "+ Szabad szöveg mező" }).click();
    const felirat = fieldCard(page, 4);
    await felirat.getByLabel("Név").first().fill("Felirat");

    await page.getByRole("button", { name: "+ Hímzés mező" }).click();
    const himzes = fieldCard(page, 5);
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
    const szin = fieldCard(page, 0);
    await expandCard(szin);
    await szin.getByLabel("Név").nth(1).fill("Zafír");
    const pirosAr = szin.getByLabel("Ár (Ft)").nth(1);
    await pirosAr.fill("700");
    await pirosAr.blur();

    const kapcsolo = fieldCard(page, 1);
    await expandCard(kapcsolo);
    const toggleAr = kapcsolo.getByLabel("Ár ha bekapcsolva (Ft)");
    await toggleAr.fill("1200");
    await toggleAr.blur();

    const productUrl = page.url();
    await page.getByRole("link", { name: "Products", exact: true }).first().click();
    const leaveDialog = page.getByRole("dialog", { name: "Elhagyod az oldalt?" });
    await expect(leaveDialog).toBeVisible();
    await leaveDialog.getByRole("button", { name: "Mégse" }).click();
    await expect(leaveDialog).toHaveCount(0);
    expect(page.url()).toBe(productUrl);

    await page.getByRole("button", { name: "+ Választó mező" }).click();
    const meret = fieldCard(page, 6);
    await meret.getByLabel("Név").first().fill("Méret");
    await meret.getByLabel("Név").nth(1).fill("S");

    await page.getByLabel("Product name", { exact: true }).fill("E2E F1 átnevezve");

    const update = waitForMutation(page, "mutation UpdateProductDefinition");
    await page.getByRole("button", { name: "Frissítés", exact: true }).click();
    await update;

    await expect(page.getByText("Mentés sikeres — a szinkronizálás fut.")).toBeVisible();
    await expect(page.getByText("Szinkronizálás…")).toBeVisible();
    await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });

    await page.reload();

    await expect(page.getByLabel("Product name", { exact: true })).toHaveValue("E2E F1 átnevezve");

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

// A choice field whose rows carry no price, tooltip or custom value: its
// option grid starts name-only.
const CHOICE_FIXTURE: FixtureDefinition = {
  id: "e2e-b1",
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
        { id: "piros", label: { hu: "Piros" }, price: 0 },
      ],
    },
  ],
  forbiddenMaterialCombinations: [],
};

test("the pricing mode and source field persist through save round-trips", async ({ page }) => {
  const fixture: FixtureDefinition = {
    ...CHOICE_FIXTURE,
    id: "e2e-p1",
    fields: [
      ...CHOICE_FIXTURE.fields,
      {
        kind: "input",
        id: "hossz",
        label: { hu: "Hossz" },
        visibility: { kind: "always" },
        required: true,
        price: 0,
      },
    ],
  };

  await test.step("login and open the fixture's configurator block", async () => {
    await login(page, "/products");
    await openFixture(page, fixture, "E2E P1");
  });

  await test.step("switching to Méteráras reveals the source select and the hint", async () => {
    await page.getByLabel("Árazás mód").selectOption({ label: "Méteráras" });

    // With no source chosen yet the editor falls back to the first
    // string-valued field; the select must still offer an explicit pick.
    await expect(page.getByLabel("Forrás mező")).toBeVisible();
    await page.getByLabel("Forrás mező").selectOption("hossz");
    await expect(page.getByText("a forrásmező saját árai figyelmen kívül maradnak")).toBeVisible();
    await expect(fieldCardById(page, "hossz").getByText("méteráras forrás")).toBeVisible();
  });

  await test.step("the pricing mode and source field survive save and reload", async () => {
    const update = waitForMutation(page, "mutation UpdateProductDefinition");
    await page.getByRole("button", { name: "Frissítés", exact: true }).click();
    await update;

    await expect(page.getByText("Mentés sikeres — a szinkronizálás fut.")).toBeVisible();
    await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });

    await page.reload();

    await expect(page.getByLabel("Árazás mód")).toHaveValue("length");
    await expect(page.getByLabel("Forrás mező")).toHaveValue("hossz");
    await expect(fieldCardById(page, "hossz").getByText("méteráras forrás")).toBeVisible();
  });

  await test.step("switching back to Egyszeri drops the source field for good", async () => {
    await page.getByLabel("Árazás mód").selectOption({ label: "Egyszeri" });
    await expect(page.getByLabel("Forrás mező")).toHaveCount(0);
    await expect(fieldCardById(page, "hossz").getByText("méteráras forrás")).toHaveCount(0);

    const update = waitForMutation(page, "mutation UpdateProductDefinition");
    await page.getByRole("button", { name: "Frissítés", exact: true }).click();
    await update;

    await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });

    await page.reload();

    await expect(page.getByLabel("Árazás mód")).toHaveValue("unit");
    await expect(page.getByLabel("Forrás mező")).toHaveCount(0);
  });
});

test("the Részletek switch reveals a choice grid's details and auto-reveals saved prices", async ({
  page,
}) => {
  await test.step("login and open the fixture's configurator block", async () => {
    await login(page, "/products");
    await openFixture(page, CHOICE_FIXTURE, "E2E B1");
  });

  await test.step("a fresh grid shows the names only", async () => {
    const szin = fieldCardById(page, "szin");
    await expandCard(szin);

    await expect(szin.getByLabel("Érték")).toHaveCount(0);
    await expect(szin.getByLabel("Ár (Ft)")).toHaveCount(0);
    // The field's own Súgó (Alap) exists; the per-row ones do not yet.
    await expect(szin.getByLabel("Súgó")).toHaveCount(1);
    await expect(szin.getByLabel("Név")).toHaveCount(3);
  });

  await test.step("flipping Részletek reveals the Érték, Ár and Súgó columns", async () => {
    const szin = fieldCardById(page, "szin");
    await szin.getByRole("switch", { name: "Részletek" }).click();

    await expect(szin.getByLabel("Érték")).toHaveCount(2);
    await expect(szin.getByLabel("Ár (Ft)")).toHaveCount(2);
    await expect(szin.getByLabel("Súgó")).toHaveCount(3);
  });

  await test.step("a saved non-zero price keeps the grid detailed after a reload", async () => {
    const szin = fieldCardById(page, "szin");
    const pirosAr = szin.getByLabel("Ár (Ft)").nth(1);
    await pirosAr.fill("500");
    await pirosAr.blur();

    const update = waitForMutation(page, "mutation UpdateProductDefinition");
    await page.getByRole("button", { name: "Frissítés", exact: true }).click();
    await update;

    await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });
    await page.reload();

    const reloaded = fieldCardById(page, "szin");
    await expandCard(reloaded);

    // No Részletek click on this page load: the saved price turned the
    // details on by itself, so the columns are already revealed.
    await expect(reloaded.getByLabel("Ár (Ft)")).toHaveCount(2);
    await expect(reloaded.getByLabel("Érték")).toHaveCount(2);
  });
});

test("the custom-value switch persists its pattern and placeholder and clears on disable", async ({
  page,
}) => {
  const fixture = { ...CHOICE_FIXTURE, id: "e2e-c1" };

  await test.step("login and open the fixture's configurator block", async () => {
    await login(page, "/products");
    await openFixture(page, fixture, "E2E C1");
  });

  await test.step("Egyéni érték reveals the pattern and placeholder inputs", async () => {
    const szin = fieldCardById(page, "szin");
    await expandCard(szin);
    await szin.getByRole("switch", { name: "Egyéni érték" }).click();

    await szin.getByLabel("Minta (regex)").fill("^[A-Za-z]+$");
    await szin.getByLabel("Helyettesítő szöveg").fill("Saját szín");
  });

  await test.step("the custom value survives save and reload", async () => {
    const update = waitForMutation(page, "mutation UpdateProductDefinition");
    await page.getByRole("button", { name: "Frissítés", exact: true }).click();
    await update;

    await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });
    await page.reload();

    // The collapsed card advertises the custom value as a summary chip.
    await expect(page.getByText("egyéni érték", { exact: true })).toBeVisible();

    const szin = fieldCardById(page, "szin");
    await expandCard(szin);
    await expect(szin.getByLabel("Minta (regex)")).toHaveValue("^[A-Za-z]+$");
    await expect(szin.getByLabel("Helyettesítő szöveg")).toHaveValue("Saját szín");
  });

  await test.step("disabling removes the custom value including its inputs", async () => {
    const szin = fieldCardById(page, "szin");
    await szin.getByRole("switch", { name: "Egyéni érték" }).click();
    await expect(szin.getByLabel("Minta (regex)")).toHaveCount(0);

    const update = waitForMutation(page, "mutation UpdateProductDefinition");
    await page.getByRole("button", { name: "Frissítés", exact: true }).click();
    await update;

    await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });
    await page.reload();

    await expect(page.getByText("egyéni érték", { exact: true })).toHaveCount(0);

    const reloaded = fieldCardById(page, "szin");
    await expandCard(reloaded);
    await expect(reloaded.getByLabel("Minta (regex)")).toHaveCount(0);
  });
});

test("the Mezők expand-all toggle opens and closes every field card", async ({ page }) => {
  const fixture: FixtureDefinition = {
    ...CHOICE_FIXTURE,
    id: "e2e-x1",
    fields: [
      ...CHOICE_FIXTURE.fields,
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
  };

  await test.step("login and open the fixture's configurator block", async () => {
    await login(page, "/products");
    await openFixture(page, fixture, "E2E X1");
  });

  await test.step("every card starts collapsed", async () => {
    await expect(fieldCardById(page, "szin").getByText("Speciális")).toHaveCount(0);
    await expect(fieldCardById(page, "meret").getByText("Speciális")).toHaveCount(0);
  });

  await test.step("the block-level toggle expands and collapses all cards", async () => {
    await page.getByRole("button", { name: "Mindet kibontása/összecsukása" }).click();

    const szin = fieldCardById(page, "szin");
    await expect(szin.getByText("Speciális")).toBeVisible();
    await expect(szin.getByRole("button", { name: "Mező összecsukása" })).toBeVisible();

    const meret = fieldCardById(page, "meret");
    await expect(meret.getByText("Speciális")).toBeVisible();
    await expect(meret.getByRole("button", { name: "Mező összecsukása" })).toBeVisible();

    await page.getByRole("button", { name: "Mindet kibontása/összecsukása" }).click();

    await expect(szin.getByText("Speciális")).toHaveCount(0);
    await expect(meret.getByText("Speciális")).toHaveCount(0);
  });

  await test.step("with one card opened by hand the toggle expands the rest", async () => {
    const szin = fieldCardById(page, "szin");
    await expandCard(szin);

    await page.getByRole("button", { name: "Mindet kibontása/összecsukása" }).click();

    await expect(fieldCardById(page, "meret").getByText("Speciális")).toBeVisible();
    await expect(szin.getByText("Speciális")).toBeVisible();
  });
});

test("the Rejtett a listában switch persists through save round-trips", async ({ page }) => {
  const fixture = { ...CHOICE_FIXTURE, id: "e2e-l1" };

  await test.step("login and open the fixture's configurator block", async () => {
    await login(page, "/products");
    await openFixture(page, fixture, "E2E L1");
  });

  await test.step("toggling it on survives save and reload", async () => {
    const rejtett = page.getByRole("switch", { name: "Rejtett a listában" });
    await expect(rejtett).toHaveAttribute("aria-checked", "false");
    await rejtett.click();
    await expect(rejtett).toHaveAttribute("aria-checked", "true");

    const update = waitForMutation(page, "mutation UpdateProductDefinition");
    await page.getByRole("button", { name: "Frissítés", exact: true }).click();
    await update;

    await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });
    await page.reload();

    await expect(page.getByRole("switch", { name: "Rejtett a listában" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });

  await test.step("toggling it off survives save and reload too", async () => {
    const rejtett = page.getByRole("switch", { name: "Rejtett a listában" });
    await rejtett.click();
    await expect(rejtett).toHaveAttribute("aria-checked", "false");

    const update = waitForMutation(page, "mutation UpdateProductDefinition");
    await page.getByRole("button", { name: "Frissítés", exact: true }).click();
    await update;

    await expect(page.getByText("Szinkronizálva")).toBeVisible({ timeout: 60_000 });
    await page.reload();

    await expect(page.getByRole("switch", { name: "Rejtett a listában" })).toHaveAttribute(
      "aria-checked",
      "false"
    );
  });
});
