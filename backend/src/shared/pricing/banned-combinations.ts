import type { LineSelections } from "../product-definition/index";

type ForbiddenCombinations = readonly (readonly string[])[];

function ruleCoveredBy(rule: readonly string[], chosen: readonly string[]): boolean {
  const available = new Map<string, number>();

  for (const materialId of chosen) {
    available.set(materialId, (available.get(materialId) ?? 0) + 1);
  }

  for (const materialId of rule) {
    const left = available.get(materialId) ?? 0;

    if (left === 0) {
      return false;
    }

    available.set(materialId, left - 1);
  }

  return true;
}

/**
 * Whether the chosen material ids (one per material field, repeats allowed)
 * contain some forbidden combination as a multiset: `[X, X]` bans X twice,
 * `[X, Y]` bans X and Y together wherever they sit.
 */
export function completesForbiddenCombination(
  chosenMaterialIds: readonly string[],
  forbidden: ForbiddenCombinations
): boolean {
  return forbidden.some((rule) => ruleCoveredBy(rule, chosenMaterialIds));
}

/** The ids of the material fields whose pick takes part in a forbidden combination. */
export function forbiddenMaterialFieldIds(
  forbidden: ForbiddenCombinations,
  selections: LineSelections
): Set<string> {
  const picks = Object.entries(selections).flatMap(([fieldId, selection]) =>
    selection?.kind === "material" ? [{ fieldId, materialId: selection.materialId }] : []
  );
  const chosen = picks.map((pick) => pick.materialId);
  const offending = new Set<string>();

  for (const rule of forbidden) {
    if (!ruleCoveredBy(rule, chosen)) {
      continue;
    }

    for (const pick of picks) {
      if (rule.includes(pick.materialId)) {
        offending.add(pick.fieldId);
      }
    }
  }

  return offending;
}
