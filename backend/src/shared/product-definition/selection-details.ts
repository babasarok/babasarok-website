import type { LineSelectionRecord, LineSelections } from "./line-selection";
import { resolveText } from "./localized-text";
import type { ProductDefinition, ProductField } from "./product";
import { dependencyOrder, isVisible } from "./field-visibility";
import { messages } from "../messages";

export interface SelectionDetail {
  label: string;
  value: string;
  depth: number;
}

/**
 * The email view's name for {@link SelectionDetail}; kept as an alias so the
 * dashboard and email rendering share one type.
 */
export type EmailDetail = SelectionDetail;

export interface SelectionLabels {
  materials: ReadonlyMap<string, { label: string; colors: ReadonlyMap<string, string> }>;
  threadColors: ReadonlyMap<string, string>;
}

export interface SelectionDetailsInput {
  definition: ProductDefinition;
  selections: LineSelections;
  lengthCm: number | null;
  labels: SelectionLabels;
  languageCode: string;
}

function visibilityDepth(field: ProductField, byId: ReadonlyMap<string, ProductField>): number {
  let depth = 0;
  const seen = new Set<string>();
  let current = field;

  while (current.kind !== "material" && current.visibility.kind !== "always") {
    const parent = byId.get(current.visibility.fieldId);

    if (parent === undefined || seen.has(parent.id)) {
      break;
    }

    seen.add(current.id);
    depth += 1;
    current = parent;
  }

  return depth;
}

function selectionValue(
  field: ProductField,
  record: LineSelectionRecord,
  input: SelectionDetailsInput
): string {
  if (record.kind === "material") {
    const material = input.labels.materials.get(record.materialId);
    const name = material?.label ?? record.materialId;
    const colors = record.colors.map((id) => material?.colors.get(id) ?? id).join(", ");

    return colors === "" ? name : `${name} (${colors})`;
  }

  if (record.kind === "embroidery") {
    return `${record.text} (${input.labels.threadColors.get(record.colorId) ?? record.colorId})`;
  }

  if (record.kind === "custom") {
    return messages(input.languageCode).detailCustom(record.value);
  }

  if (field.kind === "toggle") {
    const m = messages(input.languageCode);

    return record.value === "igen" ? m.detailToggleOn() : m.detailToggleOff();
  }

  if (field.kind === "choice") {
    const option = field.options.find((candidate) => candidate.id === record.value);

    return option === undefined ? record.value : resolveText(option.label, input.languageCode);
  }

  return record.value;
}

function fieldValues(
  fields: readonly ProductField[],
  selections: LineSelections
): Map<string, string | boolean> {
  const values = new Map<string, string | boolean>();

  for (const field of fields) {
    const record = selections[field.id];

    if (record?.kind === "input" || record?.kind === "custom") {
      values.set(field.id, record.value);
    }

    if (record?.kind === "option") {
      values.set(field.id, field.kind === "toggle" ? record.value === "igen" : record.value);
    }
  }

  return values;
}

/**
 * The buyer-visible configuration of an order line, without prices: the
 * fields the buyer filled in that are visible given their other answers,
 * in definition order, indented by visibility depth.
 */
export function selectionDetails(input: SelectionDetailsInput): SelectionDetail[] {
  const { fields } = input.definition;
  const byId = new Map<string, ProductField>(fields.map((field) => [field.id, field]));
  const { cyclic } = dependencyOrder(fields);
  const values = fieldValues(fields, input.selections);
  const details: SelectionDetail[] = [];

  if (input.lengthCm !== null) {
    details.push({
      label: messages(input.languageCode).detailLength(),
      value: `${input.lengthCm} cm`,
      depth: 0,
    });
  }

  for (const field of fields) {
    const record = input.selections[field.id];

    if (record === undefined || !isVisible(field, cyclic, new Set(byId.keys()), values)) {
      continue;
    }

    details.push({
      label: resolveText(field.label, input.languageCode),
      value: selectionValue(field, record, input),
      depth: visibilityDepth(field, byId),
    });
  }

  return details;
}
