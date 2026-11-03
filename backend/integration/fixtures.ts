/**
 * The shared fixture catalog, created through the admin API the way the owner
 * does: materials, generated products (one per field kind that matters for
 * line identity and quantity), the product groups as collections under the
 * "Szettek" / "Kapcsolódó termékek" parents, and the set promotion.
 *
 * Prices (gross Ft): parna 5 000 (+800 szegély, +1 000 nagy), takaro 8 000,
 * feszek 12 000, szalag 2 000 per metre, kendo 400, with materials priced
 * 0 / +500 / +1 000 (pamut / vaszon / len) on every material field.
 */
import { run, type IntegrationServer } from "./harness";
import { z } from "zod";

export const MATERIALS = ["int-pamut", "int-vaszon", "int-len"] as const;
export type MaterialSlug = (typeof MATERIALS)[number];

const MATERIAL_PRICES: Record<MaterialSlug, number> = {
  "int-pamut": 0,
  "int-vaszon": 500,
  "int-len": 1000,
};

export const COLORS = ["feher", "kek"] as const;

function materialField(id: string, label: string): object {
  return {
    kind: "material",
    id,
    label: { hu: label },
    options: MATERIALS.map((materialId) => ({ materialId, price: MATERIAL_PRICES[materialId] })),
    colorCount: { kind: "fixed", count: 1 },
  };
}

const PRODUCTS = [
  {
    name: "Párna",
    definition: {
      id: "int-parna",
      orderable: true,
      basePrice: 5000,
      pricing: { kind: "unit" },
      forbiddenMaterialCombinations: [],
      fields: [
        materialField("anyag", "Anyag"),
        {
          kind: "toggle",
          id: "szegely",
          label: { hu: "Szegély" },
          visibility: { kind: "always" },
          price: 800,
        },
        {
          kind: "choice",
          id: "meret",
          label: { hu: "Méret" },
          presentation: "select",
          visibility: { kind: "always" },
          options: [
            { id: "kicsi", label: { hu: "Kicsi" }, price: 0 },
            { id: "nagy", label: { hu: "Nagy" }, price: 1000 },
          ],
        },
      ],
    },
  },
  {
    name: "Takaró",
    definition: {
      id: "int-takaro",
      orderable: true,
      basePrice: 8000,
      pricing: { kind: "unit" },
      forbiddenMaterialCombinations: [],
      fields: [materialField("anyag", "Anyag")],
    },
  },
  {
    name: "Fészek",
    definition: {
      id: "int-feszek",
      orderable: true,
      basePrice: 12_000,
      pricing: { kind: "unit" },
      forbiddenMaterialCombinations: [],
      fields: [materialField("kulso", "Külső anyag"), materialField("belso", "Belső anyag")],
    },
  },
  {
    name: "Szalag",
    definition: {
      id: "int-szalag",
      orderable: true,
      basePrice: 2000,
      pricing: { kind: "length", sourceFieldId: "hossz" },
      forbiddenMaterialCombinations: [],
      fields: [
        {
          kind: "choice",
          id: "hossz",
          label: { hu: "Hossz" },
          presentation: "radio",
          visibility: { kind: "always" },
          options: [{ id: "100", label: { hu: "100 cm" }, price: 0 }],
          customValue: {},
        },
      ],
    },
  },
  {
    name: "Kendő",
    definition: {
      id: "int-kendo",
      orderable: true,
      basePrice: 400,
      pricing: { kind: "unit" },
      forbiddenMaterialCombinations: [],
      fields: [],
    },
  },
  {
    name: "Elavuló",
    definition: {
      id: "int-elavulo",
      orderable: true,
      basePrice: 6000,
      pricing: { kind: "unit" },
      forbiddenMaterialCombinations: [],
      fields: [
        materialField("anyag", "Anyag"),
        {
          kind: "choice",
          id: "meret",
          label: { hu: "Méret" },
          presentation: "select",
          visibility: { kind: "always" },
          options: [
            { id: "kicsi", label: { hu: "Kicsi" }, price: 0 },
            { id: "nagy", label: { hu: "Nagy" }, price: 1000 },
          ],
        },
      ],
    },
  },
] as const;

export type ProductId = (typeof PRODUCTS)[number]["definition"]["id"];

export const SET_PROMOTION_NAME = "Szett kedvezmény";

const GROUPS = [
  {
    slug: "int-alap-szett",
    name: "Alap szett",
    members: ["int-parna", "int-takaro"],
    discount: 1500,
  },
  {
    slug: "int-duo-szett",
    name: "Duó szett",
    members: ["int-parna", "int-feszek"],
    discount: 3000,
  },
  {
    slug: "int-olcso-szett",
    name: "Olcsó szett",
    members: ["int-szalag", "int-kendo"],
    discount: 5000,
  },
  {
    slug: "int-kiegeszito",
    name: "Kiegészítők",
    members: ["int-parna", "int-kendo"],
    discount: null,
  },
] as const;

const IdSchema = z.object({ id: z.string() });

async function createMaterials(server: IntegrationServer): Promise<void> {
  for (const slug of MATERIALS) {
    await run(
      server.admin,
      `mutation($input: MaterialInput!) { createMaterial(input: $input) { slug } }`,
      {
        input: {
          slug,
          translations: [{ languageCode: "hu", label: slug }],
          colors: COLORS.map((id) => ({
            id,
            translations: [{ languageCode: "hu", label: id }],
            hex: "#f5f5f5",
          })),
        },
      },
      z.object({ createMaterial: z.object({ slug: z.string() }) })
    );
  }
}

const SyncStateSchema = z.object({
  productDefinition: z.object({
    nativeProductId: z.number().nullable(),
    syncState: z.string(),
    syncError: z.string().nullable(),
  }),
});

async function createProducts(server: IntegrationServer): Promise<Map<ProductId, number>> {
  const nativeIds = new Map<ProductId, number>();

  for (const product of PRODUCTS) {
    await run(
      server.admin,
      `mutation($definition: JSON!, $name: String!) {
        createProductDefinition(definition: $definition, name: $name) { productId }
      }`,
      { definition: product.definition, name: product.name },
      z.object({ createProductDefinition: z.object({ productId: z.string() }) })
    );
  }

  for (const product of PRODUCTS) {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const { productDefinition } = await run(
        server.admin,
        `query($productId: String!) {
          productDefinition(productId: $productId) { nativeProductId syncState syncError }
        }`,
        { productId: product.definition.id },
        z.object({ productDefinition: SyncStateSchema.shape.productDefinition })
      );

      if (productDefinition.syncState === "failed") {
        throw new Error(`${product.definition.id} sync failed: ${productDefinition.syncError}`);
      }

      if (productDefinition.syncState === "synced" && productDefinition.nativeProductId !== null) {
        nativeIds.set(product.definition.id, productDefinition.nativeProductId);
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    if (!nativeIds.has(product.definition.id)) {
      throw new Error(`${product.definition.id} did not sync in time.`);
    }
  }

  return nativeIds;
}

async function createCollection(
  server: IntegrationServer,
  input: {
    slug: string;
    name: string;
    parentId: string | null;
    nativeIds: number[];
    setDiscount: number | null;
  }
): Promise<string> {
  const result = await run(
    server.admin,
    `mutation($input: CreateCollectionInput!) { createCollection(input: $input) { id } }`,
    {
      input: {
        isPrivate: true,
        parentId: input.parentId,
        filters: [
          {
            code: "product-id-filter",
            arguments: [
              { name: "productIds", value: JSON.stringify(input.nativeIds) },
              { name: "combineWithAnd", value: JSON.stringify(true) },
            ],
          },
        ],
        translations: [{ languageCode: "hu", name: input.name, slug: input.slug, description: "" }],
        customFields: { setDiscount: input.setDiscount },
      },
    },
    z.object({ createCollection: IdSchema })
  );

  return result.createCollection.id;
}

async function createGroups(
  server: IntegrationServer,
  nativeIds: ReadonlyMap<ProductId, number>
): Promise<void> {
  const setParent = await createCollection(server, {
    slug: "szettek",
    name: "Szettek",
    parentId: null,
    nativeIds: [],
    setDiscount: null,
  });
  const relatedParent = await createCollection(server, {
    slug: "kapcsolodo-termekek",
    name: "Kapcsolódó termékek",
    parentId: null,
    nativeIds: [],
    setDiscount: null,
  });

  for (const group of GROUPS) {
    await createCollection(server, {
      slug: group.slug,
      name: group.name,
      parentId: group.discount === null ? relatedParent : setParent,
      nativeIds: group.members.map((member) => {
        const nativeId = nativeIds.get(member);

        if (nativeId === undefined) {
          throw new Error(`${member} has no native product.`);
        }

        return nativeId;
      }),
      setDiscount: group.discount,
    });
  }
}

async function createSetPromotion(server: IntegrationServer): Promise<void> {
  const result = await run(
    server.admin,
    `mutation($input: CreatePromotionInput!) {
      createPromotion(input: $input) { __typename ... on Promotion { id } ... on ErrorResult { message } }
    }`,
    {
      input: {
        enabled: true,
        conditions: [{ code: "babasarok-product-set-basket", arguments: [] }],
        actions: [{ code: "babasarok-product-set-discount", arguments: [] }],
        translations: [{ languageCode: "hu", name: SET_PROMOTION_NAME }],
      },
    },
    z.object({ createPromotion: z.object({ __typename: z.string() }) })
  );

  if (result.createPromotion.__typename !== "Promotion") {
    throw new Error("The set promotion was not created.");
  }
}

export interface Catalog {
  nativeIds: ReadonlyMap<ProductId, number>;
}

export async function seedCatalog(server: IntegrationServer): Promise<Catalog> {
  await createMaterials(server);

  const nativeIds = await createProducts(server);

  await createGroups(server, nativeIds);
  await createSetPromotion(server);

  return { nativeIds };
}
