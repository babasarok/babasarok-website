import { z } from "zod";
import { localizedPath, type Locale } from "@/lib/i18n";
import { byPopularity } from "./mappers";
import type { CatalogMaterial, CatalogProduct } from "./mappers";

export const CatalogSearchEntrySchema = z.object({
  title: z.string(),
  url: z.string(),
  section: z.enum(["product", "material"]),
  excerpt: z.string(),
});

export const CatalogSearchIndexSchema = z.array(CatalogSearchEntrySchema);

export type CatalogSearchEntry = z.output<typeof CatalogSearchEntrySchema>;

export type SearchProduct = Pick<
  CatalogProduct,
  "slug" | "name" | "shortDescription" | "popularityRank"
>;

export type SearchMaterial = Pick<CatalogMaterial, "slug" | "label" | "subtitle">;

export function toCatalogSearchEntries(
  products: readonly SearchProduct[],
  materials: readonly SearchMaterial[],
  locale: Locale
): CatalogSearchEntry[] {
  return [
    ...byPopularity(products).map((product): CatalogSearchEntry => ({
      title: product.name,
      url: localizedPath(`/product/${product.slug}/`, locale),
      section: "product",
      excerpt: product.shortDescription ?? "",
    })),
    ...materials.map((material): CatalogSearchEntry => ({
      title: material.label,
      url: localizedPath(`/material/${material.slug}/`, locale),
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
