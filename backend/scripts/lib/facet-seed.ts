import { z } from "zod";

export type AdminRequest = (body: string) => Promise<{ data: unknown; errors: string[] }>;

export interface FacetSpec {
  code: string;
  name: string;
  isPrivate: boolean;
}

export interface FacetValueSpec {
  code: string;
  name: string;
  hex?: string;
}

export interface SeededFacetValue {
  id: string;
  hex: string | null;
  hasSwatch: boolean;
}

const FacetsSchema = z.object({
  facets: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        code: z.string(),
        isPrivate: z.boolean(),
        values: z.array(
          z.object({
            id: z.string(),
            code: z.string(),
            customFields: z
              .object({ hex: z.string().nullish(), swatch: z.object({ id: z.string() }).nullish() })
              .nullish(),
          })
        ),
      })
    ),
  }),
});

function expectSuccess(result: { errors: string[] }): void {
  if (result.errors.length > 0) {
    throw new Error(result.errors.join("; "));
  }
}

async function findFacet(
  request: AdminRequest,
  code: string
): Promise<z.output<typeof FacetsSchema>["facets"]["items"][number] | undefined> {
  const result = await request(
    JSON.stringify({
      query: `query Facet($code: String!) {
        facets(options: { filter: { code: { eq: $code } } }) {
          items { id code isPrivate values { id code customFields { hex swatch { id } } } }
        }
      }`,
      variables: { code },
    })
  );
  expectSuccess(result);

  return FacetsSchema.parse(result.data).facets.items.find((facet) => facet.code === code);
}

/**
 * Creates the facet and any missing values; existing facets and values are
 * left as the owner edited them. Returns every value of the facet by code.
 */
export async function ensureFacetWithValues(
  request: AdminRequest,
  facet: FacetSpec,
  values: readonly FacetValueSpec[]
): Promise<{ created: number; valuesByCode: Map<string, SeededFacetValue> }> {
  let existing = await findFacet(request, facet.code);

  if (existing === undefined) {
    expectSuccess(
      await request(
        JSON.stringify({
          query: `mutation CreateFacet($input: CreateFacetInput!) { createFacet(input: $input) { id } }`,
          variables: {
            input: {
              code: facet.code,
              isPrivate: facet.isPrivate,
              translations: [{ languageCode: "hu", name: facet.name }],
            },
          },
        })
      )
    );
    existing = await findFacet(request, facet.code);
  }

  if (existing === undefined) {
    throw new Error(`A(z) "${facet.code}" facet nem található a létrehozás után.`);
  }

  const facetId = existing.id;
  const known = new Set(existing.values.map((value) => value.code));
  const missing = values.filter((value) => !known.has(value.code));

  if (missing.length > 0) {
    expectSuccess(
      await request(
        JSON.stringify({
          query: `mutation CreateFacetValues($input: [CreateFacetValueInput!]!) { createFacetValues(input: $input) { id } }`,
          variables: {
            input: missing.map((value) => ({
              facetId,
              code: value.code,
              translations: [{ languageCode: "hu", name: value.name }],
              ...(value.hex === undefined ? {} : { customFields: { hex: value.hex } }),
            })),
          },
        })
      )
    );
    existing = await findFacet(request, facet.code);
  }

  if (existing === undefined) {
    throw new Error(`A(z) "${facet.code}" facet nem található az értékek létrehozása után.`);
  }

  return {
    created: missing.length,
    valuesByCode: new Map(
      existing.values.map((value) => [
        value.code,
        {
          id: value.id,
          hex: value.customFields?.hex ?? null,
          hasSwatch: value.customFields?.swatch != null,
        },
      ])
    ),
  };
}

const ProductFacetValuesSchema = z.object({
  product: z.object({
    facetValues: z.array(z.object({ id: z.string(), facet: z.object({ code: z.string() }) })),
  }),
});

/** Sets the product's value of one facet, keeping its values of every other facet. */
export async function assignProductFacetValue(
  request: AdminRequest,
  nativeProductId: number,
  facetCode: string,
  valueId: string
): Promise<void> {
  const current = await request(
    JSON.stringify({
      query: `query ProductFacetValues($id: ID!) { product(id: $id) { facetValues { id facet { code } } } }`,
      variables: { id: String(nativeProductId) },
    })
  );
  expectSuccess(current);

  const kept = ProductFacetValuesSchema.parse(current.data)
    .product.facetValues.filter((value) => value.facet.code !== facetCode)
    .map((value) => value.id);

  expectSuccess(
    await request(
      JSON.stringify({
        query: `mutation AssignFacetValue($input: UpdateProductInput!) { updateProduct(input: $input) { id } }`,
        variables: { input: { id: String(nativeProductId), facetValueIds: [...kept, valueId] } },
      })
    )
  );
}
