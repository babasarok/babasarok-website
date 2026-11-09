import {
  resolveText,
  type ProductDefinition,
  type ProductField,
} from "../product-definition/index";
import type { LineSelectionRecord, LineSelections } from "../product-definition/index";
import { axisCodes } from "./axis-codes";
import { completesForbiddenCombination } from "./banned-combinations";

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

type ProblemReason =
  | { reason: "unknown-material" }
  | { reason: "foreign-color" }
  | { reason: "too-few-colors"; required: number }
  | { reason: "text-too-long"; subject: "text" | "value" }
  | { reason: "bad-format"; subject: "text" | "value" }
  | { reason: "unoffered-value" }
  | { reason: "custom-not-accepted" };

export type SelectionProblem =
  | { code: "unknown-field"; fieldId: string }
  | { code: "wrong-kind"; fieldId: string }
  | ({ code: "invalid"; fieldId: string } & ProblemReason)
  | { code: "forbidden-combination"; materialIds: readonly string[] };

function requiredColorCount(
  field: Extract<ProductField, { kind: "material" }>,
  selections: LineSelections
): number | undefined {
  if (field.colorCount.kind === "fixed") {
    return field.colorCount.count;
  }

  const source = selections[field.colorCount.fieldId];

  if (source === undefined || source.kind === "material" || source.kind === "embroidery") {
    return undefined;
  }

  const count = Number.parseFloat(source.value);

  return Number.isNaN(count) ? undefined : count;
}

function textProblem(
  pattern: string | undefined,
  value: string,
  subject: "text" | "value"
): ProblemReason | undefined {
  if (value.length > MAX_SELECTION_TEXT_LENGTH) {
    return { reason: "text-too-long", subject };
  }

  if (value === "" && subject === "value") {
    return undefined;
  }

  return matchesPattern(pattern, value) ? undefined : { reason: "bad-format", subject };
}

function fieldProblem(
  field: ProductField,
  selection: LineSelectionRecord,
  selections: LineSelections,
  materialColors: ReadonlyMap<string, ReadonlySet<string>>
): ProblemReason | undefined {
  if (selection.kind === "material" && field.kind === "material") {
    const offered = materialColors.get(selection.materialId);

    if (offered === undefined) {
      return { reason: "unknown-material" };
    }

    if (selection.colors.some((color) => !offered.has(color))) {
      return { reason: "foreign-color" };
    }

    const required = requiredColorCount(field, selections);

    if (required !== undefined && selection.colors.length < required) {
      return { reason: "too-few-colors", required };
    }

    return undefined;
  }

  if (selection.kind === "embroidery" && field.kind === "embroidery") {
    return textProblem(field.pattern, selection.text, "text");
  }

  if (selection.kind === "input" && field.kind === "input") {
    return textProblem(field.pattern, selection.value, "value");
  }

  if (selection.kind === "option" && field.kind === "choice") {
    return field.options.some((option) => option.id === selection.value)
      ? undefined
      : { reason: "unoffered-value" };
  }

  if (selection.kind === "option" && field.kind === "toggle") {
    return selection.value === "igen" || selection.value === "nem"
      ? undefined
      : { reason: "unoffered-value" };
  }

  if (selection.kind === "custom" && field.kind === "choice") {
    if (field.customValue === undefined) {
      return { reason: "custom-not-accepted" };
    }

    return textProblem(field.customValue.pattern, selection.value, "value");
  }

  return undefined;
}

/** Every selection the product's own fields cannot accept, in selection order. */
export function validateSelections(
  input: Pick<SelectionValidationInput, "definition" | "selections" | "materialColors">
): SelectionProblem[] {
  const { definition, selections, materialColors } = input;
  const problems: SelectionProblem[] = [];

  for (const [fieldId, selection] of Object.entries(selections)) {
    if (selection === undefined) {
      continue;
    }

    const field = definition.fields.find((candidate) => candidate.id === fieldId);

    if (field === undefined) {
      problems.push({ code: "unknown-field", fieldId });
      continue;
    }

    if (!acceptedKinds(field).includes(selection.kind)) {
      problems.push({ code: "wrong-kind", fieldId });
      continue;
    }

    const problem = fieldProblem(field, selection, selections, materialColors);

    if (problem !== undefined) {
      problems.push({ code: "invalid", fieldId, ...problem });
    }
  }

  const forbidden = forbiddenCombinationProblem(definition, selections);

  if (forbidden !== undefined) {
    problems.push(forbidden);
  }

  return problems;
}

function forbiddenCombinationProblem(
  definition: ProductDefinition,
  selections: LineSelections
): SelectionProblem | undefined {
  const derived = axisCodes(definition, selections, "hu");

  if (!derived.ok) {
    return undefined;
  }

  const materialIds = definition.fields.flatMap((field) => {
    const code = field.kind === "material" ? derived.codes.get(field.id) : undefined;

    return code === undefined ? [] : [code];
  });

  if (!completesForbiddenCombination(materialIds, definition.forbiddenMaterialCombinations)) {
    return undefined;
  }

  return { code: "forbidden-combination", materialIds };
}

const SUBJECT_HU = { text: "a szöveg", value: "az érték" } as const;

function reasonMessage(problem: Extract<SelectionProblem, { code: "invalid" }>): string {
  switch (problem.reason) {
    case "unknown-material":
      return "ismeretlen anyagot tartalmaz";
    case "foreign-color":
      return "az anyag által nem kínált színt tartalmaz";
    case "too-few-colors":
      return `legalább ${problem.required} színt kell választani`;
    case "text-too-long":
      return `${SUBJECT_HU[problem.subject]} legfeljebb ${MAX_SELECTION_TEXT_LENGTH} karakter lehet`;
    case "bad-format":
      return `${SUBJECT_HU[problem.subject]} formátuma érvénytelen`;
    case "unoffered-value":
      return "nem kínált értéket tartalmaz";
    case "custom-not-accepted":
      return "egyedi értéket nem fogad el";
  }
}

export function formatSelectionProblem(
  problem: SelectionProblem,
  context: Pick<SelectionValidationInput, "definition" | "productName" | "languageCode">
): string {
  const { definition, productName, languageCode } = context;

  if (problem.code === "forbidden-combination") {
    return `A(z) "${productName}" termék ebben az anyagkombinációban nem rendelhető: ${problem.materialIds.join(", ")}.`;
  }

  if (problem.code === "unknown-field") {
    return `A(z) "${productName}" termék nem ismeri ezt a mezőt: ${problem.fieldId}`;
  }

  const field = definition.fields.find((candidate) => candidate.id === problem.fieldId);
  const label = field === undefined ? problem.fieldId : resolveText(field.label, languageCode);

  if (problem.code === "wrong-kind") {
    return `A(z) "${productName}" "${label}" mezőjének választása nem a mező fajtájának megfelelő.`;
  }

  return `A(z) "${productName}" "${label}" mezőjének választása érvénytelen: ${reasonMessage(problem)}.`;
}

/**
 * The buyer-facing refusal for the first selection the product's own fields
 * cannot accept, or undefined when every record fits its field.
 */
export function selectionsRejection(input: SelectionValidationInput): string | undefined {
  const first = validateSelections(input).at(0);

  return first === undefined ? undefined : formatSelectionProblem(first, input);
}
