import { z } from "zod";

const API = "http://localhost:4000";
const PRODUCT_ID = "e2e-checkout";
const EMAIL = "admin@babasarok.local";
const PASSWORD = "superadmin";

const Envelope = z.object({
  data: z.unknown(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

let adminToken: string | null = null;

async function gql<Schema extends z.ZodType>(
  path: "admin-api" | "shop-api",
  query: string,
  variables: Record<string, unknown>,
  schema: Schema
): Promise<z.output<Schema>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Apollo-Require-Preflight": "true",
  };

  if (adminToken !== null && path === "admin-api") {
    headers.Authorization = `Bearer ${adminToken}`;
  }

  const response = await fetch(`${API}/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const issued = response.headers.get("vendure-auth-token");

  if (issued !== null && path === "admin-api") {
    adminToken = issued;
  }

  const envelope = Envelope.parse(await response.json());

  if (envelope.errors !== undefined) {
    throw new Error(envelope.errors.map((error) => error.message).join("; "));
  }

  return schema.parse(envelope.data);
}

export function definition(withLargeSize: boolean): Record<string, unknown> {
  return {
    id: PRODUCT_ID,
    orderable: true,
    basePrice: 9000,
    pricing: { kind: "unit" },
    forbiddenMaterialCombinations: [],
    fields: [
      {
        kind: "choice",
        id: "meret",
        label: { hu: "Méret" },
        presentation: "radio",
        visibility: { kind: "always" },
        options: [
          { id: "40", label: { hu: "40x40" }, price: 0 },
          ...(withLargeSize ? [{ id: "50", label: { hu: "50x50" }, price: 2000 }] : []),
        ],
      },
    ],
  };
}

async function login(): Promise<void> {
  await gql(
    "admin-api",
    `mutation Login($u: String!, $p: String!) { authenticate(input: { native: { username: $u, password: $p } }) { ... on CurrentUser { id } } }`,
    { u: EMAIL, p: PASSWORD },
    z.unknown()
  );
}

export async function createProduct(): Promise<string> {
  await login();
  try {
    await gql(
      "admin-api",
      `mutation C($definition: JSON!, $name: String!) { createProductDefinition(definition: $definition, name: $name) { productId } }`,
      { definition: definition(true), name: "E2E Párna" },
      z.unknown()
    );
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Már létezik")) {
      throw error;
    }
  }

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = await gql(
      "shop-api",
      `query { products(options: { take: 50 }) { items { slug productDefinition } } }`,
      {},
      z.object({
        products: z.object({
          items: z.array(
            z.object({
              slug: z.string(),
              productDefinition: z.object({ id: z.string() }).nullable(),
            })
          ),
        }),
      })
    );
    const found = result.products.items.find((item) => item.productDefinition?.id === PRODUCT_ID);

    if (found !== undefined) {
      return found.slug;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error("A fixture termék nem szinkronizálódott.");
}

export async function withdrawLargeSize(): Promise<void> {
  await gql(
    "admin-api",
    `mutation U($productId: String!, $definition: JSON!, $force: Boolean) { updateProductDefinition(productId: $productId, definition: $definition, force: $force) { productId } }`,
    { productId: PRODUCT_ID, definition: definition(false), force: true },
    z.unknown()
  );
}
