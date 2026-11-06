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
import {
  DEFAULT_TEXT_LANGUAGE,
  canonicalJson,
  type ProductDefinitionInput,
} from "../../shared/product-definition/index";
import { MAX_LINE_LENGTH_CM } from "../../shared/pricing/selection-validation";

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

export type TextInput = FieldInput["label"];

export function textValue(text: TextInput | undefined, language: string): string {
  return text?.[language] ?? "";
}

/** The value a non-default language's empty input shows instead: the hu text. */
export function textPlaceholder(text: TextInput | undefined, language: string): string | undefined {
  if (language === DEFAULT_TEXT_LANGUAGE || textValue(text, language) !== "") {
    return undefined;
  }

  return text?.[DEFAULT_TEXT_LANGUAGE];
}

/** The text with `language`'s entry replaced; hu stays present (blank until
 * filled — the canonical schema rejects a blank hu on save), other languages
 * are removed when emptied. */
export function withText(text: TextInput, language: string, value: string): TextInput {
  if (language === DEFAULT_TEXT_LANGUAGE) {
    return { ...text, [DEFAULT_TEXT_LANGUAGE]: value };
  }

  if (value === "") {
    const { [language]: _removed, ...rest } = text;

    return { ...rest, [DEFAULT_TEXT_LANGUAGE]: text[DEFAULT_TEXT_LANGUAGE] };
  }

  return { ...text, [language]: value };
}

export type FieldRow = { key: string; field: FieldInput };

export function newField(kind: FieldKind, id: string, label: TextInput): FieldInput {
  const base = { id, label };

  switch (kind) {
    case "choice":
      return {
        ...base,
        kind: "choice",
        presentation: "select",
        visibility: { kind: "always" },
        options: [{ id: "", label: { hu: "" }, price: 0 }],
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
  const comparable = (candidate: FieldInput): FieldInput => ({
    ...candidate,
    id: "",
    label: { hu: "" },
  });

  return (
    canonicalJson(comparable(field)) !==
    canonicalJson(comparable(newField(field.kind, "", { hu: "" })))
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

/** Short Hungarian chips for a collapsed field card. */
export function summaryChips(field: FieldInput): string[] {
  if (field.kind === "choice") {
    const chips = [`${field.options.length} opció`];

    if (field.customValue !== undefined) {
      chips.push("egyéni érték");
    }

    return chips;
  }

  if (field.kind === "input") {
    const chips: string[] = [];

    if (field.required) {
      chips.push("kötelező");
    }

    if (field.suggestions !== undefined) {
      chips.push("javaslatok");
    }

    return chips;
  }

  if (field.kind === "toggle") {
    return [`kapcsoló ár: ${field.price} Ft`];
  }

  if (field.kind === "material") {
    const chips = [`${field.options.length} anyag`];

    if (field.colorCount.kind === "fixed") {
      chips.push(`${field.colorCount.count} szín`);
    } else {
      chips.push("színszám mezőből");
    }

    return chips;
  }

  return [EMBROIDERY_PRICING_LABELS[field.pricing.kind].toLowerCase()];
}

/** Turning custom values on keeps the pattern and placeholder the caller
 * passes (a just-disabled field no longer holds them); turning them off
 * removes the key entirely — an explicit `undefined` would still travel as a
 * property through editor state. */
export function withCustomValue(
  field: ChoiceFieldInput,
  enabled: boolean,
  previous?: ChoiceFieldInput["customValue"]
): ChoiceFieldInput {
  if (!enabled) {
    const { customValue: _removed, ...rest } = field;

    return rest;
  }

  const kept = previous ?? field.customValue;
  const customValue: NonNullable<ChoiceFieldInput["customValue"]> = {};

  if (kept?.pattern !== undefined) {
    customValue.pattern = kept.pattern;
  }

  if (kept?.placeholder !== undefined) {
    customValue.placeholder = kept.placeholder;
  }

  return { ...field, customValue };
}

/** A from-field colorCount carries no count, so switching back to fixed
 * starts from 1. */
export function withColorCountMode(
  field: MaterialFieldInput,
  mode: "fixed" | "from-field",
  fieldId?: string
): MaterialFieldInput {
  if (mode === "fixed") {
    return {
      ...field,
      colorCount: {
        kind: "fixed",
        count: field.colorCount.kind === "fixed" ? field.colorCount.count : 1,
      },
    };
  }

  return { ...field, colorCount: { kind: "from-field", fieldId: fieldId ?? "" } };
}

/** Material fields have no visibility in the canonical schema, so the call
 * leaves them untouched. */
export function withVisibility(
  field: FieldInput,
  rule: Exclude<FieldInput, MaterialFieldInput>["visibility"]
): FieldInput {
  if (field.kind === "material") {
    return field;
  }

  return { ...field, visibility: rule };
}

const HUNGARIAN_FOLDS: Record<string, string> = {
  á: "a",
  é: "e",
  í: "i",
  ó: "o",
  ö: "o",
  ő: "o",
  ú: "u",
  ü: "u",
  ű: "u",
};

/** ASCII slug of a label, in the shape the canonical ids use. */
export function slugifyLabel(label: string): string {
  const folded = label
    .toLowerCase()
    .replaceAll(/[áéíóöőúüű]/g, (char) => HUNGARIAN_FOLDS[char] ?? char);

  return folded
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

function uniqueCode(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    return base;
  }

  let n = 2;

  while (used.has(`${base}-${n}`)) {
    n += 1;
  }

  return `${base}-${n}`;
}

/** Fills in the codes the editor leaves blank (there are no manual code
 * inputs): the slug of the label, deduplicated within the scopes the server
 * validates — field ids product-wide, choice-option ids per field. Explicit
 * (seeded) codes are never rewritten, so saved codes are stable across
 * renames. */
export function assignGeneratedIds(definition: ProductDefinitionInput): ProductDefinitionInput {
  const fieldIds = new Set(definition.fields.map((field) => field.id).filter((id) => id !== ""));

  return {
    ...definition,
    fields: definition.fields.map((field) => {
      let id = field.id;

      if (id === "") {
        id = uniqueCode(slugifyLabel(field.label.hu) || "mezo", fieldIds);
        fieldIds.add(id);
      }

      if (field.kind !== "choice") {
        return id === field.id ? field : { ...field, id };
      }

      const optionIds = new Set(field.options.map((option) => option.id).filter((id) => id !== ""));

      return {
        ...field,
        id,
        options: field.options.map((option) => {
          if (option.id !== "") {
            return option;
          }

          const optionId = uniqueCode(slugifyLabel(option.label.hu) || "opcio", optionIds);
          optionIds.add(optionId);

          return { ...option, id: optionId };
        }),
      };
    }),
  };
}

/** Trims the values the editor can introduce untrimmed, so the canonical
 * schema rejects nothing on formatting alone. */
function trimText(text: TextInput): TextInput {
  const trimmed: TextInput = { hu: text.hu.trim() };

  for (const [language, value] of Object.entries(text)) {
    if (language !== DEFAULT_TEXT_LANGUAGE && value.trim() !== "") {
      trimmed[language] = value.trim();
    }
  }

  return trimmed;
}

function trimCustomValue(
  customValue: NonNullable<ChoiceFieldInput["customValue"]>
): NonNullable<ChoiceFieldInput["customValue"]> {
  const trimmed: NonNullable<ChoiceFieldInput["customValue"]> = {};

  if (customValue.pattern !== undefined) {
    trimmed.pattern = customValue.pattern.trim();
  }

  if (customValue.placeholder !== undefined) {
    trimmed.placeholder = trimText(customValue.placeholder);
  }

  return trimmed;
}

export function sanitize(definition: ProductDefinitionInput): ProductDefinitionInput {
  return {
    ...definition,
    fields: definition.fields.map((field) => {
      const trimmed = {
        ...field,
        id: field.id.trim(),
        label: trimText(field.label),
        ...(field.tooltip === undefined ? {} : { tooltip: trimText(field.tooltip) }),
      };

      if (trimmed.kind === "choice") {
        return {
          ...trimmed,
          options: trimmed.options.map((option) => ({
            ...option,
            id: option.id.trim(),
            label: trimText(option.label),
            ...(option.tooltip === undefined ? {} : { tooltip: trimText(option.tooltip) }),
          })),
          ...(trimmed.customValue === undefined
            ? {}
            : { customValue: trimCustomValue(trimmed.customValue) }),
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

      if (trimmed.kind === "input" || trimmed.kind === "embroidery") {
        return {
          ...trimmed,
          ...(trimmed.placeholder === undefined
            ? {}
            : { placeholder: trimText(trimmed.placeholder) }),
          ...(trimmed.pattern === undefined ? {} : { pattern: trimmed.pattern.trim() }),
          ...(trimmed.kind === "input" && trimmed.suggestions !== undefined
            ? {
                suggestions: trimmed.suggestions.map((suggestion) => ({
                  value: suggestion.value.trim(),
                  label: trimText(suggestion.label),
                })),
              }
            : {}),
        };
      }

      return trimmed;
    }),
    forbiddenMaterialCombinations: definition.forbiddenMaterialCombinations.map((rule) =>
      rule.map((materialId) => materialId.trim())
    ),
  };
}

export function newDefinition(id: string): ProductDefinitionInput {
  return {
    id,
    orderable: true,
    basePrice: 0,
    pricing: { kind: "unit" },
    fields: [],
    forbiddenMaterialCombinations: [],
  };
}

export type PricingMode = "unit" | "length";

export function pricingMode(definition: ProductDefinitionInput): PricingMode {
  return definition.pricing.kind === "length" ? "length" : "unit";
}

/** Switching to length pricing keeps the current source field, else falls
 * back to the first string-valued field, else stays blank until the UI picks
 * one. */
export function withPricingMode(
  definition: ProductDefinitionInput,
  mode: PricingMode,
  sourceFieldId?: string
): ProductDefinitionInput {
  if (mode === "unit") {
    return { ...definition, pricing: { kind: "unit" } };
  }

  const current =
    definition.pricing.kind === "length" ? definition.pricing.sourceFieldId : undefined;
  const preferred = sourceFieldId ?? current;
  const fallbackId = lengthSourceCandidates(definition)[0]?.id ?? "";

  return {
    ...definition,
    pricing: {
      kind: "length",
      sourceFieldId: preferred ?? fallbackId,
    },
  };
}

/** The field kinds whose buyer-facing value is a plain string — the same set
 * the server accepts as a numeric source. */
export function lengthSourceCandidates(definition: ProductDefinitionInput): FieldInput[] {
  return definition.fields.filter((field) => field.kind === "input" || field.kind === "choice");
}

export function isLengthSourceField(definition: ProductDefinitionInput, fieldId: string): boolean {
  return definition.pricing.kind === "length" && definition.pricing.sourceFieldId === fieldId;
}

/** Fields a configured reference depends on: the length source, every
 * visibility rule's subject and every colorCount source. */
export function loadBearingFieldIds(definition: ProductDefinitionInput): Set<string> {
  const ids = new Set<string>();

  if (definition.pricing.kind === "length") {
    ids.add(definition.pricing.sourceFieldId);
  }

  for (const field of definition.fields) {
    if (field.kind !== "material" && field.visibility.kind !== "always") {
      ids.add(field.visibility.fieldId);
    }

    if (field.kind === "material" && field.colorCount.kind === "from-field") {
      ids.add(field.colorCount.fieldId);
    }
  }

  return ids;
}

/** A length source must hand the storefront a bare centimeter number: inputs
 * get the digits-only pattern, an existing choice customValue gets it too —
 * custom values are never turned on here. */
export function applyLengthSourceDefaults(
  definition: ProductDefinitionInput,
  sourceFieldId: string
): ProductDefinitionInput {
  return {
    ...definition,
    fields: definition.fields.map((field) => {
      if (field.id !== sourceFieldId) {
        return field;
      }

      if (field.kind === "input" && field.pattern === undefined) {
        return { ...field, pattern: String.raw`^\d+$` };
      }

      if (
        field.kind === "choice" &&
        field.customValue !== undefined &&
        field.customValue.pattern === undefined
      ) {
        return { ...field, customValue: { ...field.customValue, pattern: String.raw`^\d+$` } };
      }

      return field;
    }),
  };
}

export interface LengthSourceValueError {
  fieldId: string;
  message: string;
}

/** What the storefront cannot parse from a choice source's option codes: not
 * a number, outside 1..10000 cm (the cap the order line enforces), or a
 * duplicated code. */
export function lengthSourceValueErrors(
  definition: ProductDefinitionInput
): LengthSourceValueError[] {
  if (definition.pricing.kind !== "length") {
    return [];
  }

  const sourceFieldId = definition.pricing.sourceFieldId;
  const source = definition.fields.find((field) => field.id === sourceFieldId);

  if (source === undefined || source.kind !== "choice") {
    return [];
  }

  const label = source.label.hu.trim();
  const name = label === "" ? source.id : label;
  const errors: LengthSourceValueError[] = [];
  const seen = new Set<string>();

  for (const option of source.options) {
    if (/^\d+$/.test(option.id)) {
      const centimeters = Number(option.id);

      if (centimeters < 1 || centimeters > MAX_LINE_LENGTH_CM) {
        errors.push({
          fieldId: source.id,
          message: `A(z) "${name}" méteráras forrásmező "${option.id}" opciókódja 1 és ${MAX_LINE_LENGTH_CM} közé eső egész szám (cm) lehet — ${MAX_LINE_LENGTH_CM} cm = 100 m.`,
        });
      }
    } else {
      errors.push({
        fieldId: source.id,
        message: `A(z) "${name}" méteráras forrásmező "${option.id}" opciókódja nem szám (cm).`,
      });
    }

    if (seen.has(option.id)) {
      errors.push({
        fieldId: source.id,
        message: `${source.id}: duplikált opciókód: "${option.id}".`,
      });
    }

    seen.add(option.id);
  }

  return errors;
}

export interface UnifiedSaveState {
  pageDirty: boolean;
  pageValid: boolean;
  configuratorDirty: boolean;
}

/** What the single Update button saves: the stock page form only when it is
 * dirty and valid, the configurator whenever it has unsaved changes. */
export function planUnifiedSave(state: UnifiedSaveState): {
  savePage: boolean;
  saveConfigurator: boolean;
} {
  return {
    savePage: state.pageDirty && state.pageValid,
    saveConfigurator: state.configuratorDirty,
  };
}

/** The Update button is enabled when anything is saveable. */
export function canUnifiedSave(state: UnifiedSaveState): boolean {
  const plan = planUnifiedSave(state);

  return plan.savePage || plan.saveConfigurator;
}
