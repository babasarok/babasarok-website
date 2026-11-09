import { z } from "zod";

export interface AdminApi {
  request<S extends z.ZodType>(
    query: string,
    variables: Record<string, unknown>,
    schema: S
  ): Promise<z.output<S>>;
}

const NamedTranslationSchema = z.object({
  languageCode: z.string(),
  name: z.string(),
  slug: z.string().nullish(),
  description: z.string().nullish(),
});

const LabelTranslationSchema = z.object({ languageCode: z.string(), label: z.string() });

const MaterialTranslationSchema = LabelTranslationSchema.extend({
  subtitle: z.string().nullish(),
  description: z.string().nullish(),
});

const ProductSchema = z.object({ id: z.string(), translations: z.array(NamedTranslationSchema) });

const MaterialSchema = z.object({
  id: z.string(),
  slug: z.string(),
  translations: z.array(MaterialTranslationSchema),
  colors: z.array(
    z.object({
      id: z.string(),
      hex: z.string().nullish(),
      asset: z.object({ id: z.string() }).nullish(),
      translations: z.array(LabelTranslationSchema),
    })
  ),
  thumbnail: z.object({ id: z.string() }).nullish(),
});

const FacetSchema = z.object({
  id: z.string(),
  code: z.string(),
  translations: z.array(NamedTranslationSchema),
  values: z.array(
    z.object({ id: z.string(), code: z.string(), translations: z.array(NamedTranslationSchema) })
  ),
});

const NamedEntitySchema = z.object({
  id: z.string(),
  translations: z.array(NamedTranslationSchema),
});

const ShippingMethodSchema = NamedEntitySchema.extend({ code: z.string() });

const DefinitionSchema = z.object({ productId: z.string(), definition: z.unknown() });

export type NamedTranslation = z.infer<typeof NamedTranslationSchema>;
export type LiveMaterial = z.infer<typeof MaterialSchema>;
export type LiveFacet = z.infer<typeof FacetSchema>;

export interface CatalogSnapshot {
  products: Array<z.infer<typeof ProductSchema>>;
  materials: LiveMaterial[];
  facets: LiveFacet[];
  collections: Array<z.infer<typeof NamedEntitySchema>>;
  promotions: Array<z.infer<typeof NamedEntitySchema>>;
  shippingMethods: Array<z.infer<typeof ShippingMethodSchema>>;
  productDefinitions: Array<z.infer<typeof DefinitionSchema>>;
}

const NAMED = "id translations { languageCode name slug description }";

async function paged<S extends z.ZodType>(
  api: AdminApi,
  field: string,
  selection: string,
  item: S,
  take: number,
  pauseMs: number
): Promise<Array<z.output<S>>> {
  const PageSchema = z.object({
    [field]: z.object({ totalItems: z.number(), items: z.array(item) }),
  });
  const items: Array<z.output<S>> = [];

  for (let skip = 0; ; skip += take) {
    const page = await api.request(
      `query($skip: Int!, $take: Int!) { ${field}(options: { skip: $skip, take: $take }) { totalItems items { ${selection} } } }`,
      { skip, take },
      PageSchema
    );
    const list = Object.values(page).at(0);

    if (list === undefined) {
      throw new Error(`the admin API returned no "${field}" list.`);
    }

    items.push(...list.items);

    if (list.items.length === 0 || items.length >= list.totalItems) {
      return items;
    }

    await new Promise((resolve) => setTimeout(resolve, pauseMs));
  }
}

/**
 * Reads every translatable catalog entity. Definitions are the heavy read
 * (each loads its full variant matrix for the staleness flag), so they are
 * paged small with pauses, and skipped entirely when not needed.
 */
export async function readCatalogSnapshot(
  api: AdminApi,
  options: { definitions: boolean }
): Promise<CatalogSnapshot> {
  const { materials } = await api.request(
    `query { materials {
      id slug
      translations { languageCode label subtitle description }
      colors { id hex asset { id } translations { languageCode label } }
      thumbnail { id }
    } }`,
    {},
    z.object({ materials: z.array(MaterialSchema) })
  );

  return {
    products: await paged(api, "products", NAMED, ProductSchema, 100, 0),
    materials,
    facets: await paged(
      api,
      "facets",
      "id code translations { languageCode name } values { id code translations { languageCode name } }",
      FacetSchema,
      100,
      0
    ),
    collections: await paged(api, "collections", NAMED, NamedEntitySchema, 100, 0),
    promotions: await paged(
      api,
      "promotions",
      "id translations { languageCode name description }",
      NamedEntitySchema,
      100,
      0
    ),
    shippingMethods: await paged(
      api,
      "shippingMethods",
      "id code translations { languageCode name description }",
      ShippingMethodSchema,
      100,
      0
    ),
    productDefinitions: options.definitions
      ? await paged(api, "productDefinitions", "productId definition", DefinitionSchema, 10, 1000)
      : [],
  };
}
