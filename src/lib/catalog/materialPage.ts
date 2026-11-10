import { localizedPath, type Locale } from "@/lib/i18n";
import type { CatalogMaterial } from "./mappers";
import type { NavLink } from "./productPage";

export interface MaterialPageData {
  material: CatalogMaterial | undefined;
  previous: NavLink | undefined;
  next: NavLink | undefined;
}

export function sortedMaterials(
  materials: readonly CatalogMaterial[],
  locale: Locale
): CatalogMaterial[] {
  return materials.toSorted((a, b) => a.label.localeCompare(b.label, locale));
}

function navLink(material: CatalogMaterial | undefined, locale: Locale): NavLink | undefined {
  if (material === undefined) {
    return undefined;
  }

  return { href: localizedPath(`/material/${material.slug}/`, locale), label: material.label };
}

/** The material for a slug and its neighbours in the label order of the material list. */
export function toMaterialPageData(
  materials: readonly CatalogMaterial[],
  slug: string,
  locale: Locale
): MaterialPageData {
  const sorted = sortedMaterials(materials, locale);
  const index = sorted.findIndex((candidate) => candidate.slug === slug);

  if (index === -1) {
    return { material: undefined, previous: undefined, next: undefined };
  }

  return {
    material: sorted[index],
    previous: navLink(sorted.slice(0, index).at(-1), locale),
    next: navLink(sorted.at(index + 1), locale),
  };
}
