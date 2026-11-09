/**
 * Seam: the translations script (backend/scripts/translations) vs. the real
 * admin API. Its reads and its update inputs (translations arrays, the
 * material input that replaces colors, definition JSON) are hand-written
 * GraphQL that no type checks against the schema, and the upload paces itself
 * on the real definition-sync queue. One run adds a language to every entity
 * kind it handles, leaves Hungarian and every custom field on the entities it
 * writes untouched, and is a no-op when re-run.
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import gql from "graphql-tag";
import type { CustomFieldConfig } from "@vendure/core";
import { z } from "zod";
import { config as vendureConfig } from "../dist/vendure-config";
import {
  readCatalogSnapshot,
  readCustomFields,
  type AdminApi,
  type WrittenEntity,
} from "../scripts/translations/catalog-snapshot";
import {
  translatableStrings,
  type TranslatableString,
} from "../scripts/translations/translatable-strings";
import type { TranslationFile } from "../scripts/translations/upload-plan";
import { runUpload, verifyUpload } from "../scripts/translations/upload";
import { seedCatalog } from "./fixtures";
import { run, startServer, type IntegrationServer } from "./harness";

let server: IntegrationServer;
let api: AdminApi;
let workDir: string;

const OPTIONS = { pollMs: 250, syncTimeoutMs: 120_000 };

// A 1×1 transparent PNG: the Asset behind the icon/swatch relation custom fields.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

const PRODUCT_DATE = "2026-01-05T10:00:00.000Z";
const SHORT_DESCRIPTION = "Kézzel varrt, mosható huzatok.";
const TAGLINE = "Kézzel készült";
const HEX = "#9caf88";

async function strings(language: string): Promise<TranslatableString[]> {
  return translatableStrings(await readCatalogSnapshot(api, { definitions: true }), language);
}

const CustomFieldsStateSchema = z.object({
  products: z.record(
    z.string(),
    z.object({
      date: z.string().nullable(),
      iconId: z.string().nullable(),
      popularityRank: z.number().nullable(),
      shortDescription: z.string().nullable(),
      tagline: z.string().nullable(),
    })
  ),
  facetValues: z.record(
    z.string(),
    z.object({ hex: z.string().nullable(), swatchId: z.string().nullable() })
  ),
  shippingMethods: z.record(z.string(), z.object({ requiresAddress: z.boolean().nullable() })),
});

type CustomFieldsState = z.output<typeof CustomFieldsStateSchema>;

/** Every custom field the script's update inputs can wipe, keyed for a stable diff. */
async function customFieldsState(): Promise<CustomFieldsState> {
  const data = await run(
    server.admin,
    `query {
      products {
        items {
          id
          customFields { date iconId popularityRank }
          translations { languageCode customFields { shortDescription tagline } }
        }
      }
      facets { items { values { id customFields { hex swatchId } } } }
      shippingMethods { items { code customFields { requiresAddress } } }
    }`,
    {},
    z.object({
      products: z.object({
        items: z.array(
          z.object({
            id: z.string(),
            customFields: z.object({
              date: z.string().nullable(),
              iconId: z.string().nullable(),
              popularityRank: z.number().nullable(),
            }),
            translations: z.array(
              z.object({
                languageCode: z.string(),
                customFields: z
                  .object({
                    shortDescription: z.string().nullable(),
                    tagline: z.string().nullable(),
                  })
                  .nullable(),
              })
            ),
          })
        ),
      }),
      facets: z.object({
        items: z.array(
          z.object({
            values: z.array(
              z.object({
                id: z.string(),
                customFields: z.object({
                  hex: z.string().nullable(),
                  swatchId: z.string().nullable(),
                }),
              })
            ),
          })
        ),
      }),
      shippingMethods: z.object({
        items: z.array(
          z.object({
            code: z.string(),
            customFields: z.object({ requiresAddress: z.boolean().nullable() }),
          })
        ),
      }),
    })
  );

  const products = Object.fromEntries(
    data.products.items.map((product) => {
      const hu = product.translations.find((translation) => translation.languageCode === "hu");

      if (hu === undefined) {
        throw new Error(`product ${product.id}: no Hungarian translation.`);
      }

      return [
        product.id,
        {
          ...product.customFields,
          ...(hu.customFields ?? { shortDescription: null, tagline: null }),
        },
      ];
    })
  );
  const facetValues = Object.fromEntries(
    data.facets.items
      .flatMap((facet) => facet.values)
      .map((value) => [value.id, value.customFields])
  );
  const shippingMethods = Object.fromEntries(
    data.shippingMethods.items.map((method) => [method.code, method.customFields])
  );

  return CustomFieldsStateSchema.parse({ products, facetValues, shippingMethods });
}

async function uploadIcon(): Promise<string> {
  const pngPath = path.join(workDir, "icon.png");
  await writeFile(pngPath, PNG_1X1);
  const result = z
    .object({
      createAssets: z.array(
        z.object({ id: z.string().optional(), message: z.string().optional() })
      ),
    })
    .parse(
      await server.admin.fileUploadMutation({
        mutation: gql`
          mutation CreateAsset($files: [CreateAssetInput!]!) {
            createAssets(input: $files) {
              ... on Asset {
                id
              }
              ... on MimeTypeError {
                errorCode
                message
              }
            }
          }
        `,
        filePaths: [pngPath],
        mapVariables: (filePaths) => ({ files: filePaths.map(() => ({ file: null })) }),
      })
    );
  const [created] = result.createAssets;

  if (created?.id === undefined) {
    throw new Error(`asset upload failed: ${created?.message ?? "unknown error"}`);
  }

  return created.id;
}

/** Gives every custom field a non-default value the upload must leave untouched. */
async function setCustomFields(): Promise<CustomFieldsState> {
  const iconId = await uploadIcon();

  const products = await run(
    server.admin,
    `query { products { items { id translations { languageCode } } } }`,
    {},
    z.object({
      products: z.object({
        items: z.array(
          z.object({
            id: z.string(),
            translations: z.array(z.object({ languageCode: z.string() })),
          })
        ),
      }),
    })
  );

  for (const product of products.products.items) {
    const hu = product.translations.find((translation) => translation.languageCode === "hu");

    if (hu === undefined) {
      throw new Error(`product ${product.id}: no Hungarian translation.`);
    }

    // No name on the row: a name-carrying product update re-enqueues its
    // definition sync, and the custom fields are not the sync's business.
    await run(
      server.admin,
      `mutation($input: UpdateProductInput!) { updateProduct(input: $input) { id } }`,
      {
        input: {
          id: product.id,
          customFields: { date: PRODUCT_DATE, iconId, popularityRank: 7 },
          translations: [
            {
              languageCode: "hu",
              customFields: { shortDescription: SHORT_DESCRIPTION, tagline: TAGLINE },
            },
          ],
        },
      },
      z.object({ updateProduct: z.object({ id: z.string() }) })
    );
  }

  const facetValues = await run(
    server.admin,
    `query { facets { items { values { id } } } }`,
    {},
    z.object({
      facets: z.object({
        items: z.array(z.object({ values: z.array(z.object({ id: z.string() })) })),
      }),
    })
  );

  for (const value of facetValues.facets.items.flatMap((facet) => facet.values)) {
    await run(
      server.admin,
      `mutation($input: UpdateFacetValueInput!) { updateFacetValue(input: $input) { id } }`,
      { input: { id: value.id, customFields: { hex: HEX, swatchId: iconId } } },
      z.object({ updateFacetValue: z.object({ id: z.string() }) })
    );
  }

  const methods = await run(
    server.admin,
    `query { shippingMethods { items { id translations { languageCode name description } } } }`,
    {},
    z.object({
      shippingMethods: z.object({
        items: z.array(
          z.object({
            id: z.string(),
            translations: z.array(
              z.object({
                languageCode: z.string(),
                name: z.string(),
                description: z.string().nullable(),
              })
            ),
          })
        ),
      }),
    })
  );

  for (const method of methods.shippingMethods.items) {
    const hu = method.translations.find((translation) => translation.languageCode === "hu");

    if (hu === undefined) {
      throw new Error(`shipping method ${method.id}: no Hungarian translation.`);
    }

    await run(
      server.admin,
      `mutation($input: UpdateShippingMethodInput!) { updateShippingMethod(input: $input) { id } }`,
      {
        input: {
          id: method.id,
          translations: [{ languageCode: "hu", name: hu.name, description: hu.description }],
          customFields: { requiresAddress: true },
        },
      },
      z.object({ updateShippingMethod: z.object({ id: z.string() }) })
    );
  }

  return customFieldsState();
}

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "translation-upload-"));
  server = await startServer();
  api = { request: (query, variables, schema) => run(server.admin, query, variables, schema) };
  await seedCatalog(server);
  await run(
    server.admin,
    `mutation($input: CreateFacetInput!) { createFacet(input: $input) { id } }`,
    {
      input: {
        code: "int-tipus",
        isPrivate: false,
        translations: [{ languageCode: "hu", name: "Típus" }],
        values: [{ code: "parna", translations: [{ languageCode: "hu", name: "Párna" }] }],
      },
    },
    z.unknown()
  );
});

afterAll(async () => {
  await server.stop();
  await rm(workDir, { recursive: true, force: true });
});

describe("translations upload", () => {
  it("reads every custom field configured on the entities the script writes", () => {
    expect(Object.keys(readCustomFields).toSorted()).toEqual([
      "Collection",
      "Facet",
      "FacetValue",
      "Material",
      "Product",
      "Promotion",
      "ShippingMethod",
    ]);

    const configured = Object.keys(vendureConfig.customFields ?? {}).filter(
      (name): name is WrittenEntity => name in readCustomFields
    );

    expect(configured).toEqual(expect.arrayContaining(["Product", "FacetValue", "ShippingMethod"]));

    const sorted = (fields: readonly string[]): string[] => fields.toSorted();
    const isLocalized = (field: CustomFieldConfig): boolean =>
      field.type === "localeString" || field.type === "localeText";
    const inputName = (field: CustomFieldConfig): string =>
      field.type === "relation"
        ? field.list === true
          ? `${field.name}Ids`
          : `${field.name}Id`
        : field.name;

    for (const name of configured) {
      const fields = vendureConfig.customFields?.[name] ?? [];

      expect({
        entity: sorted(fields.filter((field) => !isLocalized(field)).map(inputName)),
        translation: sorted(fields.filter(isLocalized).map((field) => field.name)),
      }).toEqual({
        entity: sorted(readCustomFields[name].entity),
        translation: sorted(readCustomFields[name].translation),
      });
    }
  });

  it("adds a language to every entity kind, leaves Hungarian alone and re-runs as a no-op", async () => {
    const before = await strings("de");
    const file: TranslationFile = {
      language: "de",
      strings: before
        .filter((string) => string.current === undefined)
        .map(({ key, source }) => ({ key, source, translation: `DE ${source}` })),
    };

    expect(new Set(file.strings.map((entry) => entry.key.split("|")[0]))).toEqual(
      new Set([
        "product",
        "material",
        "materialColor",
        "facet",
        "facetValue",
        "collection",
        "promotion",
        "shippingMethod",
        "definition",
      ])
    );

    await runUpload(api, file, { ...OPTIONS, write: false, log: () => {} });

    expect((await strings("de")).filter((string) => string.current !== undefined)).toEqual([]);

    const fieldsBefore = await setCustomFields();

    await runUpload(api, file, { ...OPTIONS, write: true, log: () => {} });
    await verifyUpload(api, file, () => {});

    const after = await strings("de");

    expect(after.map(({ key, source }) => [key, source])).toEqual(
      expect.arrayContaining(before.map(({ key, source }) => [key, source]))
    );

    expect(await customFieldsState()).toEqual(fieldsBefore);

    const rerun: string[] = [];

    await runUpload(api, file, {
      ...OPTIONS,
      write: true,
      log: (line) => {
        rerun.push(line);
      },
    });

    expect(rerun[0]).toBe(
      `planned 0 write(s) in 0 mutation(s), ${file.strings.length} already live: {}`
    );
  });
});
