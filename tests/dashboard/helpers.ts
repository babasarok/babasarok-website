import type { Page } from "@playwright/test";
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
const DASHBOARD = "/dashboard";
const ADMIN_API_URL = "http://localhost:4000/admin-api";
// Fixed e2e superadmin, also set in backend/e2e.env (fresh database every
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

const MaterialsList = z.object({ materials: z.array(z.object({ slug: z.string() })) });

const CreatedMaterial = z.object({ createMaterial: z.object({ slug: z.string() }) });

const MATERIALS_QUERY = `query MaterialsE2E {
  materials {
    slug
  }
}`;

const CREATE_MATERIAL = `mutation CreateMaterialE2E($input: MaterialInput!) {
  createMaterial(input: $input) {
    slug
  }
}`;

/** Ensures the fixture materials exist: the material specs mutate and delete
 * the seeded ones, so the product-definition specs rely on their own. */
export async function ensureMaterials(
  page: Page,
  materials: Array<{ slug: string; label: string }>
): Promise<void> {
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
        input: { ...material, colors: [{ id: "alap", label: "Alap", hex: "#f5f5f5" }] },
      },
      CreatedMaterial
    );
  }
}

/** Deep-links to a dashboard route and signs in on the redirect; the router
 * returns to the requested path after signing in. */
export async function login(page: Page, path: string): Promise<void> {
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
