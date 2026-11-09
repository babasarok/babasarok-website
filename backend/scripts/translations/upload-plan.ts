import { z } from "zod";
import type { CatalogSnapshot, NamedTranslation } from "./catalog-snapshot";
import {
  SOURCE_LANGUAGE,
  definitionKey,
  inLanguage,
  localizedNodes,
  translatableStrings,
  type StringCategory,
} from "./translatable-strings";

const TRIMMED_TEXT = /^\S(?:[\s\S]*\S)?$/;

export const TranslationFileSchema = z.object({
  language: z
    .string()
    .regex(/^[a-z]{2,3}(?:_[A-Za-z]+)?$/, "not a language code (e.g. en, de, pt_BR)")
    .refine((language) => language !== SOURCE_LANGUAGE, "the source language cannot be a target"),
  strings: z.array(z.object({ key: z.string(), source: z.string(), translation: z.string() })),
});

export type TranslationFile = z.infer<typeof TranslationFileSchema>;

export const MUTATIONS = {
  updateProduct: `mutation($input: UpdateProductInput!) { updateProduct(input: $input) { __typename } }`,
  updateMaterial: `mutation($id: ID!, $input: MaterialInput!) { updateMaterial(id: $id, input: $input) { __typename } }`,
  updateFacet: `mutation($input: UpdateFacetInput!) { updateFacet(input: $input) { __typename } }`,
  updateFacetValue: `mutation($input: UpdateFacetValueInput!) { updateFacetValue(input: $input) { __typename } }`,
  updateCollection: `mutation($input: UpdateCollectionInput!) { updateCollection(input: $input) { __typename } }`,
  updatePromotion: `mutation($input: UpdatePromotionInput!) { updatePromotion(input: $input) { __typename ... on ErrorResult { errorCode message } } }`,
  updateShippingMethod: `mutation($input: UpdateShippingMethodInput!) { updateShippingMethod(input: $input) { __typename } }`,
  updateProductDefinition: `mutation($productId: String!, $definition: JSON!) { updateProductDefinition(productId: $productId, definition: $definition) { __typename } }`,
} as const;

export type MutationName = keyof typeof MUTATIONS;

export interface PlannedWrite {
  key: string;
  source: string;
  translation: string;
}

interface OperationBase {
  entity: string;
  mutation: MutationName;
  variables: Record<string, unknown>;
  writes: PlannedWrite[];
}

export type UploadOperation =
  | (OperationBase & { category: Exclude<StringCategory, "definition"> })
  | (OperationBase & { category: "definition"; productId: string });

export interface UploadPlan {
  operations: UploadOperation[];
  /** Keys whose live translation already equals the file's (a re-run after an abort). */
  alreadyDone: string[];
}

export class UploadPlanError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`the upload plan is refused, nothing was written:\n  ${problems.join("\n  ")}`);
  }
}

function withoutEmpty(row: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== null && value !== undefined)
  );
}

function fileProblems(file: TranslationFile): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const { key, translation } of file.strings) {
    if (seen.has(key)) {
      problems.push(`${key}: listed twice in the file.`);
    }

    seen.add(key);

    if (!TRIMMED_TEXT.test(translation)) {
      problems.push(
        `${key}: the translation is empty or starts/ends with whitespace; fill it in the file.`
      );
    }
  }

  return problems;
}

/**
 * The mutations that add `file.language` to the live catalog. Additive only:
 * a string already translated differently, a Hungarian source that changed
 * since the extract, or an unknown key refuses the whole plan.
 * Every file entry ends up in exactly one write or in `alreadyDone`.
 */
export function planUpload(snapshot: CatalogSnapshot, file: TranslationFile): UploadPlan {
  const language = file.language;
  const problems = fileProblems(file);
  const live = new Map(translatableStrings(snapshot, language).map((s) => [s.key, s]));
  const pending = new Map<string, PlannedWrite>();
  const alreadyDone: string[] = [];

  for (const entry of file.strings) {
    const string = live.get(entry.key);

    if (string === undefined) {
      problems.push(`${entry.key}: not in the live catalog (deleted, or its source emptied).`);
      continue;
    }

    if (string.source !== entry.source) {
      problems.push(
        `${entry.key}: the Hungarian source changed since the extract (${JSON.stringify(entry.source)} → ${JSON.stringify(string.source)}); re-extract and re-translate it.`
      );
      continue;
    }

    if (string.current === entry.translation) {
      alreadyDone.push(entry.key);
      continue;
    }

    if (string.current !== undefined) {
      problems.push(
        `${entry.key}: already translated as ${JSON.stringify(string.current)}; this tool only adds missing translations.`
      );
      continue;
    }

    pending.set(entry.key, { ...entry });
  }

  if (problems.length > 0) {
    throw new UploadPlanError(problems);
  }

  const operations = buildOperations(snapshot, language, pending);
  const planned = new Set(
    operations.flatMap((operation) => operation.writes.map((write) => write.key))
  );
  const unplanned = [...pending.keys()].filter((key) => !planned.has(key));

  if (unplanned.length > 0 || planned.size !== pending.size) {
    throw new UploadPlanError(
      unplanned.map((key) => `${key}: no write planned for it (a bug in the planner).`)
    );
  }

  return { operations, alreadyDone };
}

/**
 * The entity's translations with `values` merged into the `language` row.
 * Without a value to write and without an existing row, no row is added: a
 * bare `{ languageCode }` row would lack the required name or label.
 */
function withLanguage(
  translations: ReadonlyArray<{ languageCode: string }>,
  language: string,
  values: Record<string, string | undefined>,
  defaults: Record<string, string>
): Array<Record<string, unknown>> {
  const others = translations
    .filter((translation) => translation.languageCode !== language)
    .map(withoutEmpty);
  const existing = inLanguage(translations, language);
  const written = withoutEmpty(values);

  if (existing === undefined && Object.keys(written).length === 0) {
    return others;
  }

  return [
    ...others,
    { ...defaults, ...withoutEmpty(existing ?? {}), ...written, languageCode: language },
  ];
}

/** A new slugged translation reuses the Hungarian slug; Vendure requires one per language. */
function slugDefaults(
  translations: readonly NamedTranslation[],
  language: string,
  entity: string
): Record<string, string> {
  if (inLanguage(translations, language)?.slug) {
    return {};
  }

  const slug = inLanguage(translations, SOURCE_LANGUAGE)?.slug;

  if (!slug) {
    throw new UploadPlanError([`${entity}: no Hungarian slug to copy onto the new translation.`]);
  }

  return { slug, description: "" };
}

function buildOperations(
  snapshot: CatalogSnapshot,
  language: string,
  pending: ReadonlyMap<string, PlannedWrite>
): UploadOperation[] {
  const operations: UploadOperation[] = [];

  function take(writes: PlannedWrite[], key: string): string | undefined {
    const write = pending.get(key);

    if (write === undefined) {
      return undefined;
    }

    writes.push(write);

    return write.translation;
  }

  function nameOperation(
    category: Exclude<StringCategory, "definition">,
    entity: string,
    mutation: MutationName,
    key: string,
    row: { id: string; translations: NamedTranslation[] },
    defaults: () => Record<string, string>
  ): void {
    const writes: PlannedWrite[] = [];
    const name = take(writes, key);

    if (name === undefined) {
      return;
    }

    operations.push({
      category,
      entity,
      mutation,
      variables: {
        input: {
          id: row.id,
          translations: withLanguage(row.translations, language, { name }, defaults()),
        },
      },
      writes,
    });
  }

  for (const product of snapshot.products) {
    nameOperation(
      "product",
      `product ${product.id}`,
      "updateProduct",
      `product|${product.id}|name`,
      product,
      () => slugDefaults(product.translations, language, `product ${product.id}`)
    );
  }

  for (const material of snapshot.materials) {
    const writes: PlannedWrite[] = [];
    const label = take(writes, `material|${material.slug}|label`);
    const subtitle = take(writes, `material|${material.slug}|subtitle`);
    const description = take(writes, `material|${material.slug}|description`);
    const colors = material.colors.map((color) => ({
      id: color.id,
      hex: color.hex ?? null,
      assetId: color.asset?.id ?? null,
      translations: withLanguage(
        color.translations,
        language,
        { label: take(writes, `materialColor|${material.slug}/${color.id}|label`) },
        {}
      ),
    }));

    if (writes.length === 0) {
      continue;
    }

    if (label === undefined && !inLanguage(material.translations, language)?.label) {
      throw new UploadPlanError([
        `material ${material.slug}: its ${language} label is neither live nor in the file; translate the label too.`,
      ]);
    }

    operations.push({
      category: "material",
      entity: `material ${material.slug}`,
      mutation: "updateMaterial",
      variables: {
        id: material.id,
        input: {
          slug: material.slug,
          translations: withLanguage(
            material.translations,
            language,
            { label, subtitle, description },
            { subtitle: "", description: "" }
          ),
          thumbnailAssetId: material.thumbnail?.id ?? null,
          colors,
        },
      },
      writes,
    });
  }

  for (const facet of snapshot.facets) {
    nameOperation(
      "facet",
      `facet ${facet.code}`,
      "updateFacet",
      `facet|${facet.code}|name`,
      facet,
      () => ({})
    );
  }

  for (const facet of snapshot.facets) {
    for (const value of facet.values) {
      nameOperation(
        "facetValue",
        `facet value ${facet.code}/${value.code}`,
        "updateFacetValue",
        `facetValue|${facet.code}/${value.id}|name`,
        value,
        () => ({})
      );
    }
  }

  for (const collection of snapshot.collections) {
    nameOperation(
      "collection",
      `collection ${collection.id}`,
      "updateCollection",
      `collection|${collection.id}|name`,
      collection,
      () => slugDefaults(collection.translations, language, `collection ${collection.id}`)
    );
  }

  for (const promotion of snapshot.promotions) {
    nameOperation(
      "promotion",
      `promotion ${promotion.id}`,
      "updatePromotion",
      `promotion|${promotion.id}|name`,
      promotion,
      () => ({ description: "" })
    );
  }

  for (const method of snapshot.shippingMethods) {
    nameOperation(
      "shippingMethod",
      `shipping method ${method.code}`,
      "updateShippingMethod",
      `shippingMethod|${method.code}|name`,
      method,
      () => ({ description: "" })
    );
  }

  for (const { productId, definition } of snapshot.productDefinitions) {
    const writes: PlannedWrite[] = [];
    const updated: unknown = structuredClone(definition);

    for (const { path, node } of localizedNodes(updated, "")) {
      const translation = take(writes, definitionKey(productId, path));

      if (translation !== undefined) {
        node[language] = translation;
      }
    }

    if (writes.length === 0) {
      continue;
    }

    operations.push({
      category: "definition",
      productId,
      entity: `definition ${productId}`,
      mutation: "updateProductDefinition",
      variables: { productId, definition: updated },
      writes,
    });
  }

  return operations;
}
