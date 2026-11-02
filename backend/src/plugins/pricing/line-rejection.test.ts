import { ProductDefinitionSchema } from "@babasarok/product-definition";
import { describe, expect, it } from "vitest";
import { lineRejection, type LineFacts } from "./line-rejection";

function define(orderable: boolean, pricing: unknown) {
  return ProductDefinitionSchema.parse({
    id: "parna",
    orderable,
    basePrice: 9000,
    pricing,
    forbiddenMaterialCombinations: [],
    fields: [
      {
        kind: "embroidery",
        id: "himzes",
        label: { hu: "Hímzés" },
        visibility: { kind: "always" },
        pricing: { kind: "flat", price: 500 },
      },
    ],
  });
}

function factsFor(
  definition: ReturnType<typeof define> | undefined,
  threadColors: string[] = ["piros"]
): LineFacts {
  return {
    generatedDefinition: async () => definition,
    productName: async () => "Párna",
    materialColors: async () => new Map(),
    knownThreadColors: async (ids) => new Set(ids.filter((id) => threadColors.includes(id))),
  };
}

const unit = define(true, { kind: "unit" });
const length = define(true, { kind: "length", sourceFieldId: "hossz" });
function selected(colorId: string): string {
  return JSON.stringify({ himzes: { kind: "embroidery", text: "szia", colorId } });
}

function check(
  facts: LineFacts,
  customFields: { lengthCm?: unknown; selections?: unknown } | undefined,
  storedLengthCm?: unknown
) {
  return lineRejection(facts, { productId: 1, languageCode: "hu", customFields, storedLengthCm });
}

describe("lineRejection", () => {
  it("passes non-generated products through, even without selections", async () => {
    expect(await check(factsFor(undefined), undefined)).toBeUndefined();
    expect(await check(factsFor(undefined), { selections: selected("piros") })).toBeUndefined();
  });

  it("still rejects unknown thread colors on non-generated products", async () => {
    const rejection = await check(factsFor(undefined), { selections: selected("lila") });

    expect(rejection).toContain("lila");
  });

  it("refuses a non-orderable product by name", async () => {
    const rejection = await check(factsFor(define(false, { kind: "unit" })), undefined);

    expect(rejection).toContain("Párna");
    expect(rejection).toContain("nem rendelhető");
  });

  it("requires a positive integer length for length-priced products", async () => {
    const facts = factsFor(length);

    for (const lengthCm of [undefined, 0, -5, 1.5, "100"]) {
      expect(await check(facts, { lengthCm })).toContain("hossz");
    }

    expect(await check(facts, undefined)).toContain("hossz");
    expect(await check(facts, { lengthCm: 120 })).toBeUndefined();
  });

  it("falls back to the stored length when adjusting", async () => {
    const facts = factsFor(length);

    expect(await check(facts, {}, 80)).toBeUndefined();
    expect(await check(facts, { lengthCm: 0 }, 80)).toContain("hossz");
    expect(await check(facts, {}, undefined)).toContain("hossz");
  });

  it("does not require a length for unit-priced products", async () => {
    expect(await check(factsFor(unit), undefined)).toBeUndefined();
  });

  it("returns the parse error of malformed selections", async () => {
    expect(await check(factsFor(unit), { selections: "nem json" })).toBeTypeOf("string");
  });

  it("applies the definition's selection validation", async () => {
    expect(
      await check(factsFor(unit), {
        selections: JSON.stringify({ x: { kind: "input", value: "" } }),
      })
    ).toContain("nem ismeri");
  });

  it("rejects an unknown thread color and accepts a known one", async () => {
    const facts = factsFor(unit);

    expect(await check(facts, { selections: selected("piros") })).toBeUndefined();
    expect(await check(facts, { selections: selected("lila") })).toContain("lila");
  });
});
