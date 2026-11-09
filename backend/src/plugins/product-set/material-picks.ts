import type { ProductDefinition } from "../../shared/product-definition/index";
import type { AxisCodes, LineSelections } from "../../shared/pricing/index";

export interface MaterialPick {
  materialId: string;
  colors: readonly string[];
}

export type DefinitionField = ProductDefinition["fields"][number];
type MaterialField = Extract<DefinitionField, { kind: "material" }>;

/**
 * The color count a material field demands for a line to count towards a set:
 * a fixed count, or the number carried by the referenced field's selected
 * option/custom value (the site's `color_count: <field>` rule). `undefined`
 * when the referenced selection is absent or not a number — the count cannot
 * be proven, so the line must not form an instance.
 */
function requiredColorCount(
  field: MaterialField,
  selections: LineSelections | null
): number | undefined {
  if (field.colorCount.kind === "fixed") {
    return field.colorCount.count;
  }

  const source = selections?.[field.colorCount.fieldId];

  if (source?.kind !== "option" && source?.kind !== "custom") {
    return undefined;
  }

  const count = Number.parseInt(source.value, 10);

  return Number.isInteger(count) && count >= 0 ? count : undefined;
}

/**
 * A line's material picks for the set gate: each material field's code from
 * the line's axis codes (read from its selections) with the selections'
 * colors. `undefined` means the line earns nothing: a material code is
 * missing or required colors are missing/unprovable. Lines of products
 * without material fields yield `[]` and match trivially.
 */
export function materialPicks(
  fields: readonly DefinitionField[],
  codes: AxisCodes,
  selections: LineSelections | null
): MaterialPick[] | undefined {
  const picks: MaterialPick[] = [];

  for (const field of fields) {
    if (field.kind !== "material") {
      continue;
    }

    const materialId = codes.get(field.id);

    if (materialId === undefined) {
      return undefined;
    }

    const count = requiredColorCount(field, selections);
    const selection = selections?.[field.id];
    const colors = selection?.kind === "material" ? selection.colors : [];

    if (count === undefined || colors.length < count) {
      return undefined;
    }

    picks.push({ materialId, colors });
  }

  return picks;
}
