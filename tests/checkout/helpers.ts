import { z } from "zod";
import { createShopQuery } from "../../src/lib/vendure/transport";

const API = "http://localhost:4000";
const PRODUCT_ID = "e2e-checkout";
const EMAIL = "admin@babasarok.local";
const PASSWORD = "superadmin";

const Envelope = z.object({
  data: z.unknown(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

let adminToken: string | null = null;

const shopQuery = createShopQuery({ fetch, apiUrl: API, languageCode: "hu" });

async function gql<Schema extends z.ZodType>(
  query: string,
  variables: Record<string, unknown>,
  schema: Schema
): Promise<z.output<Schema>> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Apollo-Require-Preflight": "true",
  };

  if (adminToken !== null) {
    headers.Authorization = `Bearer ${adminToken}`;
  }

  const response = await fetch(`${API}/admin-api`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  });
  const issued = response.headers.get("vendure-auth-token");

  if (issued !== null) {
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
    `mutation Login($u: String!, $p: String!) { authenticate(input: { native: { username: $u, password: $p } }) { ... on CurrentUser { id } } }`,
    { u: EMAIL, p: PASSWORD },
    z.unknown()
  );
}

const ProductsSchema = z.object({
  products: z.object({
    items: z.array(
      z.object({
        slug: z.string(),
        productDefinition: z.object({ id: z.string() }).nullable(),
        variants: z.array(z.object({ priceWithTax: z.number() })),
      })
    ),
  }),
});

async function findShopProduct(
  productId: string,
  accept: (priceWithTax: number) => boolean
): Promise<string> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const result = await shopQuery({
      query: `query { products(options: { take: 50 }) { items { slug productDefinition variants { priceWithTax } } } }`,
      schema: ProductsSchema,
    });
    const found = result.products.items.find(
      (item) =>
        item.productDefinition?.id === productId &&
        item.variants.some((variant) => accept(variant.priceWithTax))
    );

    if (found !== undefined) {
      return found.slug;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`A(z) ${productId} fixture termék nem szinkronizálódott.`);
}

async function createDefinition(
  productDefinition: Record<string, unknown>,
  name: string
): Promise<void> {
  await login();
  try {
    await gql(
      `mutation C($definition: JSON!, $name: String!) { createProductDefinition(definition: $definition, name: $name) { productId } }`,
      { definition: productDefinition, name },
      z.unknown()
    );
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Már létezik")) {
      throw error;
    }
  }
}

export async function createProduct(): Promise<string> {
  await createDefinition(definition(true), "E2E Párna");

  return findShopProduct(PRODUCT_ID, () => true);
}

function plainDefinition(id: string, basePrice: number): Record<string, unknown> {
  return {
    id,
    basePrice,
    pricing: { kind: "unit" },
    forbiddenMaterialCombinations: [],
    fields: [],
  };
}

const PRICED_PRODUCT_ID = "e2e-priced";
const PRICED_BEFORE = 5000;
const PRICED_AFTER = 6000;

export async function createPricedProduct(): Promise<void> {
  await createDefinition(plainDefinition(PRICED_PRODUCT_ID, PRICED_BEFORE), "E2E Változó ár");
  await findShopProduct(PRICED_PRODUCT_ID, () => true);
}

export async function raisePrice(): Promise<void> {
  await gql(
    `mutation U($productId: String!, $definition: JSON!) { updateProductDefinition(productId: $productId, definition: $definition) { productId } }`,
    {
      productId: PRICED_PRODUCT_ID,
      definition: plainDefinition(PRICED_PRODUCT_ID, PRICED_AFTER),
    },
    z.unknown()
  );
  await findShopProduct(PRICED_PRODUCT_ID, (price) => price === PRICED_AFTER);
}

export async function createDeliveryProduct(): Promise<void> {
  await createDefinition(plainDefinition("e2e-delivery", 30_000), "E2E Szállítás");
  await findShopProduct("e2e-delivery", () => true);
}

const SET_MATERIALS = [
  { slug: "e2e-szett-alfa", label: "Alfa" },
  { slug: "e2e-szett-beta", label: "Béta" },
];

function setMemberDefinition(id: string, basePrice: number): Record<string, unknown> {
  return {
    id,
    basePrice,
    pricing: { kind: "unit" },
    forbiddenMaterialCombinations: [],
    fields: [
      {
        kind: "material",
        id: "anyag",
        label: { hu: "Anyag" },
        options: SET_MATERIALS.map((material) => ({ materialId: material.slug, price: 0 })),
        colorCount: { kind: "fixed", count: 1 },
      },
    ],
  };
}

const SetMemberSyncSchema = z.object({
  productDefinition: z.object({ nativeProductId: z.number().nullable() }),
});

async function nativeProductId(productId: string): Promise<number> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const { productDefinition } = await gql(
      `query($productId: String!) { productDefinition(productId: $productId) { nativeProductId } }`,
      { productId },
      SetMemberSyncSchema
    );

    if (productDefinition.nativeProductId !== null) {
      return productDefinition.nativeProductId;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error(`A(z) ${productId} nem szinkronizálódott.`);
}

export const SET_TITLE = "E2E Szett";
const SET_DISCOUNT = 1000;

export async function createSet(): Promise<void> {
  await login();

  for (const material of SET_MATERIALS) {
    await gql(
      `mutation($input: MaterialInput!) { createMaterial(input: $input) { slug } }`,
      {
        input: {
          slug: material.slug,
          translations: [{ languageCode: "hu", label: material.label }],
          colors: [
            { id: "feher", translations: [{ languageCode: "hu", label: "Fehér" }], hex: "#f5f5f5" },
          ],
        },
      },
      z.unknown()
    );
  }

  await createDefinition(setMemberDefinition("e2e-szett-fej", 3000), "E2E Szett Fej");
  await createDefinition(setMemberDefinition("e2e-szett-lab", 4000), "E2E Szett Láb");

  const fej = await nativeProductId("e2e-szett-fej");
  const lab = await nativeProductId("e2e-szett-lab");

  // A set is one promotion: members on the condition, the flat Ft amount on
  // the action, the Hungarian name as the set label (ADR 0014).
  await gql(
    `mutation($input: CreatePromotionInput!) { createPromotion(input: $input) { __typename } }`,
    {
      input: {
        enabled: true,
        conditions: [
          {
            code: "babasarok-product-set-members",
            arguments: [{ name: "productIds", value: JSON.stringify([fej, lab]) }],
          },
        ],
        actions: [
          {
            code: "babasarok-product-set-discount",
            arguments: [{ name: "amount", value: String(SET_DISCOUNT) }],
          },
        ],
        translations: [{ languageCode: "hu", name: SET_TITLE }],
      },
    },
    z.unknown()
  );
  await findShopProduct("e2e-szett-fej", () => true);
  await findShopProduct("e2e-szett-lab", () => true);
}

export async function withdrawLargeSize(): Promise<void> {
  await gql(
    `mutation U($productId: String!, $definition: JSON!) { updateProductDefinition(productId: $productId, definition: $definition) { productId } }`,
    { productId: PRODUCT_ID, definition: definition(false) },
    z.unknown()
  );
}
