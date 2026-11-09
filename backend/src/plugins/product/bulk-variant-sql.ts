/**
 * The pure SQL-shaping and diff logic of the bulk variant writer, separated
 * so it is unit-testable without a database. Every physical column name here
 * is confirmed against the live schema; the scalar FK columns (baseId,
 * variantId) have no entity property, so their writes must bypass TypeORM's
 * entity mapping — which would silently drop unknown keys to NULL.
 */

/** One parameterized INSERT statement with at most `chunkSize` rows. */
export interface ChunkedInsert {
  sql: string;
  params: unknown[];
}

/**
 * Builds INSERT statements for `table` in chunks of `chunkSize` rows, with
 * one optional `returning` column. Parameter numbering restarts per chunk.
 */
export function buildChunkedInsert(
  table: string,
  columns: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
  chunkSize: number,
  returning?: string
): ChunkedInsert[] {
  const statements: ChunkedInsert[] = [];

  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const placeholders = chunk
      .map(
        (_, row) =>
          `(${columns.map((__, column) => `$${row * columns.length + column + 1}`).join(", ")})`
      )
      .join(", ");
    const returningSql = returning === undefined ? "" : ` returning "${returning}"`;

    statements.push({
      sql: `insert into "${table}" (${columns
        .map((c) => `"${c}"`)
        .join(", ")}) values ${placeholders}${returningSql}`,
      params: chunk.flat(),
    });
  }

  return statements;
}

/** An existing translation row, keyed by (baseId, languageCode). */
export interface ExistingTranslation {
  id: number;
  baseId: number;
  languageCode: string;
  name: string;
}

/** One planned translation write: what the variant's name should say. */
export interface PlannedTranslation {
  variantId: number;
  languageCode: string;
  name: string;
}

/** A translation diff like TranslationDiffer's: inserts for missing
 * languages, updates for changed names, and never deletions. */
export interface TranslationDiff {
  toInsert: Array<{ baseId: number; languageCode: string; name: string }>;
  toUpdate: Array<{ id: number; name: string }>;
}

export function diffTranslations(
  existing: ReadonlyArray<ExistingTranslation>,
  planned: ReadonlyArray<PlannedTranslation>
): TranslationDiff {
  const byKey = new Map<string, ExistingTranslation>(
    existing.map((row) => [`${row.baseId}:${row.languageCode}`, row])
  );
  const diff: TranslationDiff = { toInsert: [], toUpdate: [] };

  for (const translation of planned) {
    const found = byKey.get(`${translation.variantId}:${translation.languageCode}`);

    if (found === undefined) {
      diff.toInsert.push({
        baseId: translation.variantId,
        languageCode: translation.languageCode,
        name: translation.name,
      });
    } else if (found.name !== translation.name) {
      diff.toUpdate.push({ id: found.id, name: translation.name });
    }
  }

  return diff;
}
