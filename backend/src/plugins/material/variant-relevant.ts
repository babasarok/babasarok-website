import { byCodeUnit } from "../../shared/product-definition/index";

interface LabelTranslation {
  languageCode: string;
  label: string;
}

interface VariantRelevantMaterial {
  translations: readonly LabelTranslation[];
  colors: ReadonlyArray<{ colorId: string; translations: readonly LabelTranslation[] }>;
}

/** The material fields the product sync reads: its label and its colors' ids and labels. */
function variantRelevantKey(material: VariantRelevantMaterial): string {
  const labels = (translations: readonly LabelTranslation[]): string[] =>
    translations
      .map((translation) => `${translation.languageCode}=${translation.label}`)
      .toSorted();

  return JSON.stringify({
    labels: labels(material.translations),
    colors: material.colors
      .map((color) => ({ id: color.colorId, labels: labels(color.translations) }))
      .toSorted((a, b) => byCodeUnit(a.id, b.id)),
  });
}

/** True when an update changed anything the product sync reads. */
export function variantRelevantChange(
  before: VariantRelevantMaterial,
  after: VariantRelevantMaterial
): boolean {
  return variantRelevantKey(before) !== variantRelevantKey(after);
}
