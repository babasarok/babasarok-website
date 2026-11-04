import { createHash } from "node:crypto";
import { z } from "zod";
import type { MigrationInterface, QueryRunner } from "typeorm";

function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).toSorted(([a], [b]) => byCodeUnit(a, b));

    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }

  if (value === undefined) {
    return "null";
  }

  return JSON.stringify(value);
}

type Json = Record<string, unknown>;
type TextMapper = (value: unknown) => unknown;

function isJson(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function mapEach(items: unknown, map: (item: Json) => Json): unknown {
  if (!isArray(items)) {
    return items;
  }

  return items.map((item) => (isJson(item) ? map(item) : item));
}

function mapKeys(object: Json, keys: string[], mapText: TextMapper): Json {
  const result: Json = { ...object };

  for (const key of keys) {
    if (key in result) {
      result[key] = mapText(result[key]);
    }
  }

  return result;
}

function mapDefinitionText(definition: Json, mapText: TextMapper): Json {
  const fields = mapEach(definition.fields, (field) => {
    const mapped = mapKeys(field, ["label", "tooltip", "placeholder"], mapText);

    if ("options" in mapped) {
      mapped.options = mapEach(mapped.options, (option) =>
        mapKeys(option, ["label", "tooltip"], mapText)
      );
    }

    if ("suggestions" in mapped) {
      mapped.suggestions = mapEach(mapped.suggestions, (suggestion) =>
        mapKeys(suggestion, ["label"], mapText)
      );
    }

    if (isJson(mapped.customValue)) {
      mapped.customValue = mapKeys(mapped.customValue, ["placeholder"], mapText);
    }

    return mapped;
  });

  return { ...definition, fields };
}

function wrap(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  return { hu: value };
}

function unwrap(value: unknown): unknown {
  if (!isJson(value)) {
    return value;
  }

  return value.hu;
}

const RowsSchema = z.array(
  z.object({
    id: z.number(),
    definition: z.record(z.string(), z.unknown()),
    syncedDefinitionHash: z.string().nullable(),
  })
);

async function rewrite(queryRunner: QueryRunner, mapText: TextMapper): Promise<void> {
  const rows = RowsSchema.parse(
    await queryRunner.query(
      `SELECT "id", "definition", "syncedDefinitionHash" FROM "product_definition"`
    )
  );

  for (const row of rows) {
    const definition = mapDefinitionText(row.definition, mapText);
    const oldRevision = row.definition.revision;

    if (typeof oldRevision === "string") {
      const { revision: _revision, ...facts } = definition;

      definition.revision = createHash("sha256").update(canonicalJson(facts)).digest("hex");
    }

    const syncedHash =
      row.syncedDefinitionHash === oldRevision ? definition.revision : row.syncedDefinitionHash;

    await queryRunner.query(
      `UPDATE "product_definition" SET "definition" = $1, "syncedDefinitionHash" = $2 WHERE "id" = $3`,
      [JSON.stringify(definition), syncedHash ?? null, row.id]
    );
  }
}

export class LocalizedDefinitionText1793617900000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<any> {
    await rewrite(queryRunner, wrap);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await rewrite(queryRunner, unwrap);
  }
}
