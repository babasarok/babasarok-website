/**
 * Pure editor logic for the product-definition dashboard extension: the
 * canonical field types in their input shape (plain, unbranded strings, which
 * is what text inputs naturally produce), the field-kind label maps, and the
 * transforms the configurator editor applies to that state. No React, no API
 * access — unit-tested by product-definition-editor.test.ts.
 *
 * Prices are whole Forints end to end (the backend's ForintMoneyStrategy sets
 * minor-unit precision 0), so no editor-side conversion happens.
 */
import { canonicalJson, type ProductDefinitionInput } from "@babasarok/product-definition";

export type FieldInput = ProductDefinitionInput["fields"][number];
export type ChoiceFieldInput = Extract<FieldInput, { kind: "choice" }>;
export type ChoiceOptionInput = ChoiceFieldInput["options"][number];
export type ToggleFieldInput = Extract<FieldInput, { kind: "toggle" }>;
export type MaterialFieldInput = Extract<FieldInput, { kind: "material" }>;
export type MaterialOptionInput = MaterialFieldInput["options"][number];
export type InputFieldInput = Extract<FieldInput, { kind: "input" }>;
export type EmbroideryFieldInput = Extract<FieldInput, { kind: "embroidery" }>;

export const FIELD_KINDS = ["choice", "toggle", "material", "input", "embroidery"] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export const FIELD_KIND_LABELS: Record<FieldKind, string> = {
  choice: "Választó",
  toggle: "Kapcsoló",
  material: "Anyag",
  input: "Szabad szöveg",
  embroidery: "Hímzés",
};

export const PRESENTATIONS = ["select", "radio", "color"] as const;

export const PRESENTATION_LABELS: Record<ChoiceFieldInput["presentation"], string> = {
  select: "Legördülő",
  radio: "Rádiógomb",
  color: "Színminta",
};

export const EMBROIDERY_PRICINGS = ["per-word", "flat"] as const;

export const EMBROIDERY_PRICING_LABELS: Record<
  Extract<FieldInput, { kind: "embroidery" }>["pricing"]["kind"],
  string
> = {
  "per-word": "Szavanként",
  flat: "Egyszeri",
};

export type FieldRow = { key: string; field: FieldInput };

export function newField(kind: FieldKind, id: string, label: string): FieldInput {
  const base = { id, label };

  switch (kind) {
    case "choice":
      return {
        ...base,
        kind: "choice",
        presentation: "select",
        visibility: { kind: "always" },
        options: [{ id: "", label: "", price: 0 }],
      };
    case "toggle":
      return { ...base, kind: "toggle", visibility: { kind: "always" }, price: 0 };
    case "material":
      return {
        ...base,
        kind: "material",
        options: [],
        colorCount: { kind: "fixed", count: 1 },
      };
    case "input":
      return {
        ...base,
        kind: "input",
        visibility: { kind: "always" },
        required: true,
        price: 0,
      };
    case "embroidery":
      return {
        ...base,
        kind: "embroidery",
        visibility: { kind: "always" },
        pricing: { kind: "per-word", pricePerWord: 0 },
      };
  }
}

/** Whether the field holds anything beyond a fresh row's defaults — a kind
 * switch would discard exactly that, so it is what the confirm asks about. */
export function hasEditableData(field: FieldInput): boolean {
  const comparable = (candidate: FieldInput): FieldInput => ({ ...candidate, id: "", label: "" });

  return (
    canonicalJson(comparable(field)) !== canonicalJson(comparable(newField(field.kind, "", "")))
  );
}

/** Carries the kind-independent pass-through fields across a kind switch.
 * Material fields carry no tooltip or visibility, so they keep their own. */
export function carryOver(next: FieldInput, previous: FieldInput): FieldInput {
  if (next.kind === "material") {
    return next;
  }

  const carried = {
    ...next,
    visibility: previous.kind === "material" ? next.visibility : previous.visibility,
  };

  if (previous.tooltip !== undefined) {
    carried.tooltip = previous.tooltip;
  }

  return carried;
}

/** Trims the values the editor can introduce untrimmed, so the canonical
 * schema rejects nothing on formatting alone. */
export function sanitize(definition: ProductDefinitionInput): ProductDefinitionInput {
  return {
    ...definition,
    label: definition.label.trim(),
    fields: definition.fields.map((field) => {
      const trimmed = { ...field, id: field.id.trim(), label: field.label.trim() };

      if (trimmed.kind === "choice") {
        return {
          ...trimmed,
          options: trimmed.options.map((option) => ({
            ...option,
            id: option.id.trim(),
            label: option.label.trim(),
          })),
        };
      }

      if (trimmed.kind === "material") {
        return {
          ...trimmed,
          options: trimmed.options.map((option) => ({
            ...option,
            materialId: option.materialId.trim(),
          })),
        };
      }

      return trimmed;
    }),
    forbiddenMaterialCombinations: definition.forbiddenMaterialCombinations.map((rule) =>
      rule.map((materialId) => materialId.trim())
    ),
  };
}

export function newDefinition(
  id: string,
  label: string,
  type: ProductDefinitionInput["type"]
): ProductDefinitionInput {
  return {
    id,
    label,
    type,
    orderable: true,
    basePrice: 0,
    pricing: { kind: "unit" },
    fields: [],
    forbiddenMaterialCombinations: [],
  };
}
