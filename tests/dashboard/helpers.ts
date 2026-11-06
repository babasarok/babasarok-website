import type { Locator, Page } from "@playwright/test";
import { z } from "zod";

/**
 * Shared helpers for the dashboard e2e specs. materials.spec.ts predates this
 * module and keeps its own copies of the login/mutation helpers.
 *
 * The API origin the dashboard bundle bakes in at build time: the e2e
 * webServer serves the admin API on :4000 (playwright.dashboard.config.ts).
 * Specs use it directly for setup the dashboard UI cannot perform (creating
 * fixtures without exercising a creation flow, hand-editing native data to
 * provoke drift).
 */
export const DASHBOARD = "/dashboard";
const ADMIN_API_URL = "http://localhost:4000/admin-api"; // Fixed e2e superadmin, also set in backend/e2e.env (fresh database every
// run, so Vendure bootstraps exactly this administrator).
const EMAIL = "admin@babasarok.local";
const PASSWORD = "superadmin";

// The dashboard persists its bearer token here (localStorage of the :4100
// origin); sending it as a header authenticates the helper's requests
// regardless of cookie/CSRF details.
const SESSION_TOKEN_KEY = "vendure-session-token";

const GqlEnvelope = z.object({
  data: z.unknown(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

export const CreatedDefinition = z.object({
  createProductDefinition: z.object({ productId: z.string(), syncState: z.string().optional() }),
});

export const DefinitionState = z.object({
  productDefinition: z.object({ nativeProductId: z.number().nullable() }).nullable(),
});

export const GeneratedVariants = z.object({
  generatedVariants: z.object({
    items: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
});

export const UpdatedVariant = z.object({
  updateProductVariant: z.object({ id: z.string() }),
});

const MaterialsList = z.object({
  materials: z.array(z.object({ id: z.string(), slug: z.string() })),
});

const CreatedMaterial = z.object({ createMaterial: z.object({ slug: z.string() }) });

const MATERIALS_QUERY = `query MaterialsE2E {
  materials {
    id
    slug
  }
}`;

const CREATE_MATERIAL = `mutation CreateMaterialE2E($input: MaterialInput!) {
  createMaterial(input: $input) {
    slug
  }
}`;

const DELETE_MATERIAL = `mutation DeleteMaterialE2E($id: ID!) {
  deleteMaterial(id: $id)
}`;

const DELETE_DEFINITION = `mutation DeleteProductDefinitionE2E($productId: String!) {
  deleteProductDefinition(productId: $productId)
}`;

const CREATE_PRODUCT = `mutation CreateProductE2E($input: CreateProductInput!) {
  createProduct(input: $input) {
    id
  }
}`;

const CREATE_PRODUCT_VARIANTS = `mutation CreateProductVariantsE2E($input: [CreateProductVariantInput!]!) {
  createProductVariants(input: $input) {
    id
  }
}`;

const CreatedProduct = z.object({
  createProduct: z.object({ id: z.string() }),
});

const CreatedVariants = z.object({
  createProductVariants: z.array(z.object({ id: z.string() })),
});

/** Creates a plain (non-generated) product with a single variant, for specs
 * that need the stock variants grid — generated products hide it in favor of
 * the configurator's own table. */
export async function createManualProduct(
  page: Page,
  slug: string,
  name = "E2E Manual Product"
): Promise<string> {
  const product = await adminApi(
    page,
    CREATE_PRODUCT,
    {
      input: {
        translations: [{ languageCode: "en", name, slug, description: "" }],
      },
    },
    CreatedProduct
  );

  const variants = await adminApi(
    page,
    CREATE_PRODUCT_VARIANTS,
    {
      input: [
        {
          productId: product.createProduct.id,
          sku: `${slug}--variant`,
          price: 15_400,
          translations: [{ languageCode: "en", name: "E2E Manual Variant" }],
        },
      ],
    },
    CreatedVariants
  );

  if (variants.createProductVariants.length !== 1) {
    throw new Error("A manuális terméket nem sikerült változattal ellátni.");
  }

  return product.createProduct.id;
}

const CREATE_COLLECTION = `mutation CreateCollectionE2E($input: CreateCollectionInput!) {
  createCollection(input: $input) {
    id
  }
}`;

/** Creates a top-level collection without filters. */
export async function createCollection(page: Page, name: string, slug: string): Promise<void> {
  await adminApi(
    page,
    CREATE_COLLECTION,
    {
      input: {
        translations: [{ languageCode: "en", name, slug, description: "" }],
        filters: [],
      },
    },
    z.object({ createCollection: z.object({ id: z.string() }) })
  );
}

/** The row cards of a narrow data table (the patched molecule's card layout,
 * ADR 0013). */
export function tableCards(page: Page): Locator {
  return page.locator('[data-slot="data-table-card"]');
}

/** Card titles in display order, reduced to the given fixture names. */
export async function cardOrder(page: Page, names: string[]): Promise<string[]> {
  const texts = await tableCards(page).allInnerTexts();

  return texts.flatMap((text) => names.filter((name) => text.includes(name)));
}

/** The drag handle beside the card that shows `name` (rows that cannot be
 * dragged have none, so handles do not line up with cards by index). */
export function cardDragHandle(page: Page, name: string): Locator {
  return page
    .getByRole("listitem")
    .filter({ has: tableCards(page).filter({ hasText: name }) })
    .getByRole("button", { name: "Drag to reorder" });
}

/** Drags `handle` with the pointer, in small steps (dnd-kit needs moves past
 * its activation threshold), until it sits just past `target`. */
export async function dragHandleOnto(page: Page, handle: Locator, target: Locator): Promise<void> {
  const from = await handle.boundingBox();
  const to = await target.boundingBox();

  if (from === null || to === null) {
    throw new Error("A húzófogantyú nem látható.");
  }

  const x = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  const endY = to.y + to.height / 2 + 10;

  await page.mouse.move(x, startY);
  await page.mouse.down();

  for (let step = 1; step <= 10; step++) {
    await page.mouse.move(x, startY + ((endY - startY) * step) / 10);
  }

  await page.mouse.up();
}

/** Creates a definition fixture; the mutation returns before the queued sync
 * produced the native structure (that is what the sync spec asserts). The
 * `name` is the native Product's name (ADR 0011 decision 1). */
export const CREATE_DEFINITION = `mutation CreateProductDefinitionE2E($definition: JSON!, $name: String!) {
  createProductDefinition(definition: $definition, name: $name) {
    productId
    syncState
  }
}`;

export const DEFINITION_STATE = `query ProductDefinitionE2E($productId: String!) {
  productDefinition(productId: $productId) {
    nativeProductId
  }
}`;

/** The configurator's generated-variants table (its Hungarian price column
 * keeps it apart from the stock variants table on the same page). */
export function generatedTable(page: Page): Locator {
  return page
    .locator('[data-slot="data-table"]')
    .filter({ has: page.getByRole("columnheader", { name: "Ár (Ft)" }) });
}

/** The stock product page's own variants table (Money-formatted prices). */
export function stockTable(page: Page): Locator {
  return page
    .locator('[data-slot="data-table"]')
    .filter({ has: page.getByRole("columnheader", { name: "Price" }) });
}

/** A configurator field card, in definition order — the only binding for
 * freshly created rows, whose field ids are generated on save. */
export function fieldCard(page: Page, index: number): Locator {
  return page.locator('[data-testid="field-card"]').nth(index);
}

/** The configurator field card carrying a saved field id. */
export function fieldCardById(page: Page, fieldId: string): Locator {
  return page.locator(`[data-testid="field-card"][data-field-id="${fieldId}"]`);
}

/** Expands a collapsed field card via its header chevron; cards load
 * collapsed after every page load. */
export async function expandCard(card: Locator): Promise<void> {
  await card.getByRole("button", { name: "Mező kibontása" }).click();
}

interface FixtureMaterial {
  slug: string;
  label: string;
  colors?: Array<{ id: string; label: string; hex: string }>;
}

/** The materials the e2e server seeds (backend/scripts/e2e-server.ts), in the
 * shape the materials spec asserts; a failed attempt leaves them renamed,
 * mutated or deleted, so the spec's fixture setup re-creates them here. */
export const SEED_MATERIALS: FixtureMaterial[] = [
  { slug: "e2e-pamut", label: "Pamut", colors: [{ id: "feher", label: "Fehér", hex: "#f5f5f5" }] },
  { slug: "e2e-vaszon", label: "Vászon", colors: [] },
];

/** Ensures the fixture materials exist: the material specs mutate and delete
 * the seeded ones, so the product-definition specs rely on their own. */
export async function ensureMaterials(page: Page, materials: FixtureMaterial[]): Promise<void> {
  const existing = await adminApi(page, MATERIALS_QUERY, {}, MaterialsList);
  const known = new Set(existing.materials.map((material) => material.slug));

  for (const material of materials) {
    if (known.has(material.slug)) {
      continue;
    }

    await adminApi(
      page,
      CREATE_MATERIAL,
      {
        input: {
          slug: material.slug,
          translations: [{ languageCode: "hu", label: material.label }],
          colors: (material.colors ?? [{ id: "alap", label: "Alap", hex: "#f5f5f5" }]).map(
            (color) => ({
              id: color.id,
              translations: [{ languageCode: "hu", label: color.label }],
              hex: color.hex,
            })
          ),
        },
      },
      CreatedMaterial
    );
  }
}

/** Deletes a leftover fixture material from a previous attempt: createMaterial
 * hard-rejects an existing slug, so a retried spec must start without it. */
export async function deleteMaterialIfPresent(page: Page, slug: string): Promise<void> {
  const existing = await adminApi(page, MATERIALS_QUERY, {}, MaterialsList);
  const match = existing.materials.find((material) => material.slug === slug);

  if (match === undefined) {
    return;
  }

  await adminApi(
    page,
    DELETE_MATERIAL,
    { id: match.id },
    z.object({ deleteMaterial: z.boolean() })
  );
}

/** Deletes a leftover fixture definition from a previous attempt: the specs
 * re-create the same fixed productId and assert on its fresh-create state, so
 * each run must start from an absent id. */
export async function deleteDefinitionIfPresent(page: Page, productId: string): Promise<void> {
  const state = await adminApi(page, DEFINITION_STATE, { productId }, DefinitionState);

  if (state.productDefinition === null) {
    return;
  }

  await adminApi(
    page,
    DELETE_DEFINITION,
    { productId },
    z.object({ deleteProductDefinition: z.boolean() })
  );
}

/** Deep-links to a dashboard route and signs in on the redirect; the router
 * returns to the requested path after signing in. */
export async function login(page: Page, path: string): Promise<void> {
  await page.addInitScript(() => {
    if (localStorage.getItem("vendure-user-settings") === null) {
      localStorage.setItem("vendure-user-settings", JSON.stringify({ contentLanguage: "hu" }));
    }
  });
  await page.goto(`${DASHBOARD}${path}`);
  await page.locator("#field-username").fill(EMAIL);
  await page.locator("#field-password").fill(PASSWORD);
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`**${DASHBOARD}${path}`);
}

/** Resolves with the admin-api response that carries the named GraphQL
 * operation; start it before the triggering click and await it after. */
export async function waitForMutation(page: Page, name: string): Promise<void> {
  await page.waitForResponse(
    (response) =>
      response.url().includes("/admin-api") && (response.request().postData() ?? "").includes(name)
  );
}

/** Runs one admin-API operation with the signed-in session's token and
 * returns its `data` parsed through `dataSchema`; GraphQL errors throw. */
export async function adminApi<S extends z.ZodType>(
  page: Page,
  query: string,
  variables: Record<string, unknown>,
  dataSchema: S
): Promise<z.output<S>> {
  const token = await page.evaluate((key) => localStorage.getItem(key), SESSION_TOKEN_KEY);

  if (token === null) {
    throw new Error("Nincs bejelentkezési token — a login helper előbb fusson.");
  }

  const response = await page.request.post(ADMIN_API_URL, {
    data: { query, variables },
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok()) {
    throw new Error(`admin-api responded ${response.status()}: ${await response.text()}`);
  }

  const body: unknown = await response.json();
  const envelope = GqlEnvelope.parse(body);

  if (envelope.errors !== undefined && envelope.errors.length > 0) {
    throw new Error(envelope.errors.map((error) => error.message).join("\n"));
  }

  return dataSchema.parse(envelope.data);
}
