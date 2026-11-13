import { canonicalJson } from "../../shared/product-definition/index";
import type { LocalizedText, ProductDefinition } from "../../shared/product-definition/index";

/** The one native variant a generated product carries (ADR 0016). */
export interface VariantState {
  sku: string;
  name: LocalizedText;
  price: number;
}

export interface VariantDrift {
  kind: "presence" | "sku" | "rename" | "price";
  label: string;
  /** The changed values, display-ready; null for the presence kinds. */
  from: string | null;
  to: string | null;
}

/**
 * The variant a sync of `definition` writes: the definition id as its SKU,
 * the native product's name in every language, and the base price. The
 * variant's price is display data only — orders price from the definition
 * and the line's selections.
 */
export function plannedVariant(
  definition: ProductDefinition,
  productName: LocalizedText
): VariantState {
  return { sku: definition.id, name: productName, price: definition.basePrice };
}

function textValue(text: LocalizedText): string {
  const languages = Object.keys(text);

  return languages.length === 1
    ? text[languages[0] as keyof LocalizedText]
    : languages
        .map((language) => `${language}: ${text[language as keyof LocalizedText]}`)
        .join(" / ");
}

function ft(price: number): string {
  return `${price} Ft`;
}

/** What a sync would change on the native variants: empty when they match the plan. */
export function variantDrift(
  planned: VariantState,
  current: readonly VariantState[]
): VariantDrift[] {
  const variant = current.at(0);

  if (variant === undefined) {
    return [{ kind: "presence", label: "A termék változata hiányzik", from: null, to: null }];
  }

  if (current.length > 1) {
    return [
      {
        kind: "presence",
        label: `${current.length} változat van egy helyett`,
        from: null,
        to: null,
      },
    ];
  }

  const drift: VariantDrift[] = [];

  if (variant.sku !== planned.sku) {
    drift.push({
      kind: "sku",
      label: `SKU eltér: ${variant.sku} → ${planned.sku}`,
      from: variant.sku,
      to: planned.sku,
    });
  }

  if (canonicalJson(variant.name) !== canonicalJson(planned.name)) {
    drift.push({
      kind: "rename",
      label: `Név eltér: ${variant.name.hu} → ${planned.name.hu}`,
      from: textValue(variant.name),
      to: textValue(planned.name),
    });
  }

  if (variant.price !== planned.price) {
    drift.push({
      kind: "price",
      label: `Ár eltér: ${variant.price} → ${planned.price}`,
      from: ft(variant.price),
      to: ft(planned.price),
    });
  }

  return drift;
}
