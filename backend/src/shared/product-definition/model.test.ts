import { describe, expect, it } from "vitest";
import { MoneySchema, ProductFieldIdSchema, ProductIdSchema, TrimmedTextSchema } from "./model";

describe("MoneySchema", () => {
  it.each([1.5, -1, "100", Number.NaN])("rejects invalid money value %j", (value) => {
    expect(MoneySchema.safeParse(value).success).toBe(false);
  });

  it.each([0, 1200])("accepts valid money value %j", (value) => {
    expect(MoneySchema.parse(value)).toBe(value);
  });
});

const trimmedTextSchemas = [
  { name: "TrimmedTextSchema", schema: TrimmedTextSchema },
  { name: "ProductIdSchema", schema: ProductIdSchema },
  { name: "ProductFieldIdSchema", schema: ProductFieldIdSchema },
];

describe.each(trimmedTextSchemas)("$name", ({ schema }) => {
  it.each([[""], [" a"], ["a "]])("rejects invalid trimmed text %j", (value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  it.each(["Eu borito", "#4 candypink", "Fehér"])("accepts valid trimmed text %j", (value) => {
    expect(schema.parse(value)).toBe(value);
  });
});
