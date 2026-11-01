import { z } from "zod";

/** The columns the definitions table can sort by (its other columns are projections). */
const SORTABLE_KEYS = new Set(["productId", "label", "basePrice"]);

/** The dashboard's PaginatedListDataTable sends sort as `{ [column]: "ASC" | "DESC" }`. */
const definitionSortSchema = z.record(z.string(), z.enum(["ASC", "DESC"]));

/** The fields the sort acts on; ProductDefinition rows are structurally compatible. */
interface SortableDefinitionRow {
  productId: string;
  definition: { label: string; basePrice: number };
}

function definitionValue(row: SortableDefinitionRow, key: string): string | number {
  if (key === "label") {
    return row.definition.label;
  }

  if (key === "basePrice") {
    return row.definition.basePrice;
  }

  return row.productId;
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === "string" && typeof b === "string") {
    return a.localeCompare(b, "hu");
  }

  if (a < b) {
    return -1;
  }

  if (a > b) {
    return 1;
  }

  return 0;
}

/** Sorts in memory over the whitelisted columns; anything unparseable or
 * unsortable keeps the default productId order (stable base for paging). */
export function sortDefinitions<T extends SortableDefinitionRow>(rows: T[], sort: unknown): T[] {
  const parsed = definitionSortSchema.safeParse(sort);

  if (!parsed.success) {
    return rows;
  }

  const clauses = Object.entries(parsed.data).filter(([key]) => SORTABLE_KEYS.has(key));

  if (clauses.length === 0) {
    return rows;
  }

  return rows.toSorted((a, b) => {
    for (const [key, direction] of clauses) {
      const comparison = compareValues(definitionValue(a, key), definitionValue(b, key));

      if (comparison !== 0) {
        return direction === "DESC" ? -comparison : comparison;
      }
    }

    return 0;
  });
}
