import type { CatalogSnapshot } from "./catalog-snapshot";

export const SOURCE_LANGUAGE = "hu";

export type StringCategory =
  | "product"
  | "material"
  | "materialColor"
  | "facet"
  | "facetValue"
  | "collection"
  | "promotion"
  | "shippingMethod"
  | "definition";

export interface TranslatableString {
  key: string;
  category: StringCategory;
  source: string;
  current: string | undefined;
}

export interface LocalizedNode {
  path: string;
  node: Record<string, string>;
}

export function inLanguage<T extends { languageCode: string }>(
  translations: readonly T[],
  language: string
): T | undefined {
  return translations.find((translation) => translation.languageCode === language);
}

function isLocalizedText(node: object): node is Record<string, string> {
  const values = Object.values(node);

  return (
    SOURCE_LANGUAGE in node &&
    values.length > 0 &&
    values.every((value) => typeof value === "string")
  );
}

/** Every `{ hu: …, … }` text object inside a product definition, keyed by its path. */
export function localizedNodes(node: unknown, path: string): LocalizedNode[] {
  if (Array.isArray(node)) {
    return node.flatMap((child, index) => localizedNodes(child, `${path}[${index}]`));
  }

  if (node === null || typeof node !== "object") {
    return [];
  }

  if (isLocalizedText(node)) {
    return [{ path, node }];
  }

  return Object.entries(node).flatMap(([key, child]) => localizedNodes(child, `${path}.${key}`));
}

export function definitionKey(productId: string, path: string): string {
  return `definition|def/${productId}${path}|text`;
}

/**
 * The catalog's translatable strings with their Hungarian source and their
 * current value in `language`. Empty sources have nothing to translate and
 * are left out.
 */
export function translatableStrings(
  snapshot: CatalogSnapshot,
  language: string
): TranslatableString[] {
  const strings: TranslatableString[] = [];

  function add(
    key: string,
    category: StringCategory,
    source: string | null | undefined,
    current: string | null | undefined
  ): void {
    if (source === undefined || source === null || source === "") {
      return;
    }

    strings.push({ key, category, source, current: current || undefined });
  }

  for (const product of snapshot.products) {
    add(
      `product|${product.id}|name`,
      "product",
      inLanguage(product.translations, SOURCE_LANGUAGE)?.name,
      inLanguage(product.translations, language)?.name
    );
  }

  for (const material of snapshot.materials) {
    const source = inLanguage(material.translations, SOURCE_LANGUAGE);
    const target = inLanguage(material.translations, language);

    add(`material|${material.slug}|label`, "material", source?.label, target?.label);
    add(`material|${material.slug}|subtitle`, "material", source?.subtitle, target?.subtitle);
    add(
      `material|${material.slug}|description`,
      "material",
      source?.description,
      target?.description
    );

    for (const color of material.colors) {
      add(
        `materialColor|${material.slug}/${color.id}|label`,
        "materialColor",
        inLanguage(color.translations, SOURCE_LANGUAGE)?.label,
        inLanguage(color.translations, language)?.label
      );
    }
  }

  for (const facet of snapshot.facets) {
    add(
      `facet|${facet.code}|name`,
      "facet",
      inLanguage(facet.translations, SOURCE_LANGUAGE)?.name,
      inLanguage(facet.translations, language)?.name
    );

    for (const value of facet.values) {
      add(
        `facetValue|${facet.code}/${value.id}|name`,
        "facetValue",
        inLanguage(value.translations, SOURCE_LANGUAGE)?.name,
        inLanguage(value.translations, language)?.name
      );
    }
  }

  for (const collection of snapshot.collections) {
    add(
      `collection|${collection.id}|name`,
      "collection",
      inLanguage(collection.translations, SOURCE_LANGUAGE)?.name,
      inLanguage(collection.translations, language)?.name
    );
  }

  for (const promotion of snapshot.promotions) {
    add(
      `promotion|${promotion.id}|name`,
      "promotion",
      inLanguage(promotion.translations, SOURCE_LANGUAGE)?.name,
      inLanguage(promotion.translations, language)?.name
    );
  }

  for (const method of snapshot.shippingMethods) {
    add(
      `shippingMethod|${method.code}|name`,
      "shippingMethod",
      inLanguage(method.translations, SOURCE_LANGUAGE)?.name,
      inLanguage(method.translations, language)?.name
    );
  }

  for (const definition of snapshot.productDefinitions) {
    for (const { path, node } of localizedNodes(definition.definition, "")) {
      add(definitionKey(definition.productId, path), "definition", node.hu, node[language]);
    }
  }

  return strings;
}
