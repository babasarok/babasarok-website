import {
  resolveText,
  type ProductDefinition,
  type ProductField,
} from "@babasarok/product-definition";
import type { LineSelectionRecord, LineSelections } from "./line-selection.js";

/**
 * The site's configurator sets no text limits; this keeps a buyer-entered value
 * (input, custom choice value, embroidery text) well past any real label yet
 * far from abusing the order line's stored JSON.
 */
export const MAX_SELECTION_TEXT_LENGTH = 200;

/** 100 m: far beyond any fabric run, and keeps price × length inside the int price column. */
export const MAX_LINE_LENGTH_CM = 10_000;

export interface SelectionValidationInput {
  definition: ProductDefinition;
  productName: string;
  selections: LineSelections;
  /** Material slug → the colour ids that material offers. */
  materialColors: ReadonlyMap<string, ReadonlySet<string>>;
  languageCode: string;
}

export function referencedMaterialIds(selections: LineSelections): string[] {
  return [
    ...new Set(
      Object.values(selections).flatMap((selection) =>
        selection?.kind === "material" ? [selection.materialId] : []
      )
    ),
  ];
}

function acceptedKinds(field: ProductField): readonly LineSelectionRecord["kind"][] {
  switch (field.kind) {
    case "input":
      return ["input"];
    case "choice":
      return ["option", "custom"];
    case "toggle":
      return ["option"];
    case "material":
      return ["material"];
    case "embroidery":
      return ["embroidery"];
  }
}

function matchesPattern(pattern: string | undefined, value: string): boolean {
  return pattern === undefined || new RegExp(pattern).test(value);
}

function fieldProblem(
  field: ProductField,
  selection: LineSelectionRecord,
  materialColors: ReadonlyMap<string, ReadonlySet<string>>
): string | undefined {
  if (selection.kind === "material" && field.kind === "material") {
    const offered = materialColors.get(selection.materialId);

    if (offered === undefined) {
      return "ismeretlen anyagot tartalmaz";
    }

    if (new Set(selection.colors).size !== selection.colors.length) {
      return "ugyanazt a színt többször tartalmazza";
    }

    if (selection.colors.some((color) => !offered.has(color))) {
      return "az anyag által nem kínált színt tartalmaz";
    }

    return undefined;
  }

  if (selection.kind === "embroidery" && field.kind === "embroidery") {
    if (selection.text.length > MAX_SELECTION_TEXT_LENGTH) {
      return `a szöveg legfeljebb ${MAX_SELECTION_TEXT_LENGTH} karakter lehet`;
    }

    return matchesPattern(field.pattern, selection.text)
      ? undefined
      : "a szöveg formátuma érvénytelen";
  }

  if (selection.kind === "input" && field.kind === "input") {
    if (selection.value.length > MAX_SELECTION_TEXT_LENGTH) {
      return `az érték legfeljebb ${MAX_SELECTION_TEXT_LENGTH} karakter lehet`;
    }

    if (selection.value === "") {
      return undefined;
    }

    return matchesPattern(field.pattern, selection.value)
      ? undefined
      : "az érték formátuma érvénytelen";
  }

  if (selection.kind === "option" && field.kind === "choice") {
    return field.options.some((option) => option.id === selection.value)
      ? undefined
      : "nem kínált értéket tartalmaz";
  }

  if (selection.kind === "option" && field.kind === "toggle") {
    return selection.value === "igen" || selection.value === "nem"
      ? undefined
      : "nem kínált értéket tartalmaz";
  }

  if (selection.kind === "custom" && field.kind === "choice") {
    if (field.customValue === undefined) {
      return "egyedi értéket nem fogad el";
    }

    if (selection.value.length > MAX_SELECTION_TEXT_LENGTH) {
      return `az érték legfeljebb ${MAX_SELECTION_TEXT_LENGTH} karakter lehet`;
    }

    return matchesPattern(field.customValue.pattern, selection.value)
      ? undefined
      : "az érték formátuma érvénytelen";
  }

  return undefined;
}

/**
 * The buyer-facing refusal for the first selection the product's own fields
 * cannot accept, or undefined when every record fits its field.
 */
export function selectionsRejection(input: SelectionValidationInput): string | undefined {
  const { definition, productName, selections, materialColors, languageCode } = input;

  for (const [fieldId, selection] of Object.entries(selections)) {
    if (selection === undefined) {
      continue;
    }

    const field = definition.fields.find((candidate) => candidate.id === fieldId);

    if (field === undefined) {
      return `A(z) "${productName}" termék nem ismeri ezt a mezőt: ${fieldId}`;
    }

    const label = resolveText(field.label, languageCode);

    if (!acceptedKinds(field).includes(selection.kind)) {
      return `A(z) "${productName}" "${label}" mezőjének választása nem a mező fajtájának megfelelő.`;
    }

    const problem = fieldProblem(field, selection, materialColors);

    if (problem !== undefined) {
      return `A(z) "${productName}" "${label}" mezőjének választása érvénytelen: ${problem}.`;
    }
  }

  return undefined;
}
