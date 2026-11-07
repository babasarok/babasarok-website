import { z } from "zod";
import { listedByPopularity } from "./listItems";
import type { CatalogMaterial, CatalogProduct } from "./mappers";

export const CatalogSearchEntrySchema = z.object({
  title: z.string(),
  url: z.string(),
  section: z.enum(["product", "material"]),
  excerpt: z.string(),
});

export const CatalogSearchIndexSchema = z.array(CatalogSearchEntrySchema);

export type CatalogSearchEntry = z.output<typeof CatalogSearchEntrySchema>;

export function toCatalogSearchEntries(
  products: readonly CatalogProduct[],
  materials: readonly CatalogMaterial[]
): CatalogSearchEntry[] {
  return [
    ...listedByPopularity(products).map((product): CatalogSearchEntry => ({
      title: product.name,
      url: `/product/${product.slug}/`,
      section: "product",
      excerpt: product.shortDescription ?? "",
    })),
    ...materials.map((material): CatalogSearchEntry => ({
      title: material.label,
      url: `/material/${material.slug}/`,
      section: "material",
      excerpt: material.subtitle,
    })),
  ];
}

function fold(text: string): string {
  return text.normalize("NFD").replaceAll(/\p{M}/gu, "").toLowerCase();
}

export function matchCatalogEntries(
  entries: readonly CatalogSearchEntry[],
  term: string
): CatalogSearchEntry[] {
  const needle = fold(term.trim());

  if (needle === "") {
    return [];
  }

  return entries.filter((entry) => fold(`${entry.title} ${entry.excerpt}`).includes(needle));
}
