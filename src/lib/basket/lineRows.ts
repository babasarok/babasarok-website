import {
  resolveText,
  type ProductDefinition,
  type ProductField,
} from "@babasarok/product-definition";
import { parseLineSelections, type LineSelectionRecord } from "@babasarok/pricing";

const LANGUAGE = "hu";

export interface Labels {
  materials: Record<string, { label: string; colors: Record<string, string> }>;
  threadColors: Record<string, string>;
}

export interface LineRow {
  label: string;
  value: string;
}

function optionLabel(field: ProductField, value: string): string {
  if (field.kind !== "choice") {
    return value;
  }

  const option = field.options.find((candidate) => candidate.id === value);

  return option === undefined ? value : resolveText(option.label, LANGUAGE);
}

function valueText(field: ProductField, selection: LineSelectionRecord, labels: Labels): string {
  switch (selection.kind) {
    case "input":
      return selection.value;
    case "custom":
      return `Egyedi: ${selection.value}`;
    case "option":
      if (field.kind === "toggle") {
        return selection.value === "igen" ? "Igen" : "Nem";
      }

      return optionLabel(field, selection.value);
    case "material": {
      const material = labels.materials[selection.materialId];
      const colors = selection.colors.map((color) => material?.colors[color] ?? color);

      return [material?.label ?? selection.materialId, ...colors].join(", ");
    }
    case "embroidery":
      return `${selection.text} (${labels.threadColors[selection.colorId] ?? selection.colorId})`;
  }
}

export function describeLine(
  definition: ProductDefinition,
  rawSelections: string | null,
  labels: Labels
): LineRow[] {
  let selections: ReturnType<typeof parseLineSelections>;

  try {
    selections = parseLineSelections(rawSelections);
  } catch {
    return [];
  }

  return definition.fields.flatMap((field) => {
    const selection = selections[field.id];

    if (selection === undefined) {
      return [];
    }

    return [{ label: resolveText(field.label, LANGUAGE), value: valueText(field, selection, labels) }];
  });
}
