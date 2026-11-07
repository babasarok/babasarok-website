import {
  selectionDetails,
  type LineSelections,
  type ProductDefinition,
  type SelectionLabels,
} from "@babasarok/product-definition";
import { parseLineSelections } from "@babasarok/pricing";

export interface Labels {
  materials: Partial<Record<string, { label: string; colors: Partial<Record<string, string>> }>>;
  threadColors: Partial<Record<string, string>>;
}

export interface LineRow {
  label: string;
  value: string;
}

function definedEntries(record: Partial<Record<string, string>>): [string, string][] {
  const entries: [string, string][] = [];

  for (const [key, value] of Object.entries(record)) {
    if (value !== undefined) {
      entries.push([key, value]);
    }
  }

  return entries;
}

function asMaps(labels: Labels): SelectionLabels {
  return {
    materials: new Map(
      Object.entries(labels.materials).map(([slug, value]) => [
        slug,
        {
          label: value?.label ?? slug,
          colors: new Map(definedEntries(value?.colors ?? {})),
        },
      ])
    ),
    threadColors: new Map(definedEntries(labels.threadColors)),
  };
}

/**
 * The buyer-visible configuration of an order line as label/value rows, from
 * the line's structured `selections` and the product definition — the same
 * formatting the backend applies to the line's dashboard `configText`.
 * Unparseable selections yield no rows.
 */
export function describeLine(
  definition: ProductDefinition,
  rawSelections: string | null,
  labels: Labels
): LineRow[] {
  let selections: LineSelections;

  try {
    // The thrown message is discarded below, so the parse language never renders.
    selections = parseLineSelections(rawSelections, "hu");
  } catch {
    return [];
  }

  // ponytail: the details language stays Hungarian until the ui-dicts slice
  // wires a locale prop into the order islands (ADR 0015 slice 3).
  return selectionDetails({
    definition,
    selections,
    lengthCm: null,
    labels: asMaps(labels),
    languageCode: "hu",
  }).map(({ label, value }) => ({ label, value }));
}
