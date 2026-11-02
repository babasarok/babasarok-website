import type { ProductDefinition } from "@babasarok/product-definition";
import type { LineSelections } from "@babasarok/pricing";

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
 * A line's material picks for the set gate, derived from the variant's own
 * options (the material axes are variant options — authoritative) and the
 * selections' colors only. `undefined` means the line earns nothing: a
 * material option is missing on the variant (drift) or required colors are
 * missing/unprovable. Lines of products without material fields yield `[]`
 * and match trivially.
 */
export function materialPicks(
  fields: readonly DefinitionField[],
  optionCodesByGroup: ReadonlyMap<string, readonly string[]>,
  selections: LineSelections | null
): MaterialPick[] | undefined {
  const picks: MaterialPick[] = [];

  for (const field of fields) {
    if (field.kind !== "material") {
      continue;
    }

    const optionCodes = optionCodesByGroup.get(field.id);

    if (optionCodes === undefined || optionCodes.length !== 1) {
      return undefined;
    }

    const count = requiredColorCount(field, selections);
    const selection = selections?.[field.id];
    const colors = selection?.kind === "material" ? selection.colors : [];

    if (count === undefined || colors.length < count) {
      return undefined;
    }

    picks.push({ materialId: optionCodes[0], colors });
  }

  return picks;
}
