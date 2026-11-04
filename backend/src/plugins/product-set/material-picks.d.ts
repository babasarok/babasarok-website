import type { ProductDefinition } from "@babasarok/product-definition";
import type { LineSelections } from "@babasarok/pricing";
export interface MaterialPick {
    materialId: string;
    colors: readonly string[];
}
export type DefinitionField = ProductDefinition["fields"][number];
/**
 * A line's material picks for the set gate, derived from the variant's own
 * options (the material axes are variant options — authoritative) and the
 * selections' colors only. `undefined` means the line earns nothing: a
 * material option is missing on the variant (drift) or required colors are
 * missing/unprovable. Lines of products without material fields yield `[]`
 * and match trivially.
 */
export declare function materialPicks(fields: readonly DefinitionField[], optionCodesByGroup: ReadonlyMap<string, readonly string[]>, selections: LineSelections | null): MaterialPick[] | undefined;
