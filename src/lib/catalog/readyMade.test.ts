import { describe, expect, it } from "vitest";
import {
  initialVariant,
  isOptionAvailable,
  totalStock,
  variantForOption,
  type ReadyMadeOrdering,
  type ReadyMadeVariant,
} from "./readyMade";

// Colour (red 1, blue 2) × size (S 3, L 4). Red/L was never created and
// Blue/S is sold out, so neither can be picked.
function variant(
  id: string,
  optionIds: string[],
  over: Partial<ReadyMadeVariant> = {}
): ReadyMadeVariant {
  return { id, priceWithTax: 5000, saleableStock: 2, soldOut: false, optionIds, ...over };
}

const redS = variant("rs", ["1", "3"]);
const blueS = variant("bs", ["2", "3"], { soldOut: true, saleableStock: 0 });
const blueL = variant("bl", ["2", "4"], { priceWithTax: 7000, saleableStock: 1 });

const ordering: ReadyMadeOrdering = {
  kind: "ready-made",
  currencyCode: "HUF",
  optionGroups: [
    {
      id: "colour",
      name: "Szín",
      options: [
        { id: "1", name: "Piros" },
        { id: "2", name: "Kék" },
      ],
    },
    {
      id: "size",
      name: "Méret",
      options: [
        { id: "3", name: "S" },
        { id: "4", name: "L" },
      ],
    },
  ],
  variants: [blueS, redS, blueL],
};

describe("initialVariant", () => {
  it("starts on the first variant in stock", () => {
    expect(initialVariant(ordering)).toBe(redS);
  });

  it("keeps a basket line's variant while it is in stock", () => {
    expect(initialVariant(ordering, "bl")).toBe(blueL);
  });

  it("falls back to the first in stock when the preferred variant sold out", () => {
    expect(initialVariant(ordering, "bs")).toBe(redS);
  });
});

describe("isOptionAvailable", () => {
  it("offers an option some in-stock variant carries", () => {
    expect(isOptionAvailable(ordering, "4")).toBe(true);
  });

  it("disables an option whose every variant is sold out", () => {
    const soldOutL: ReadyMadeOrdering = {
      ...ordering,
      variants: [redS, { ...blueL, soldOut: true }],
    };

    expect(isOptionAvailable(soldOutL, "4")).toBe(false);
  });
});

describe("variantForOption", () => {
  it("prefers the in-stock variant keeping the other picks over the first match", () => {
    const redL = variant("rl", ["1", "4"]);
    const full: ReadyMadeOrdering = { ...ordering, variants: [redS, redL, blueL] };

    expect(variantForOption(full, blueL, "1")).toBe(redL);
  });

  it("moves past a sold-out combination to an in-stock one", () => {
    expect(variantForOption(ordering, blueL, "3")).toBe(redS);
  });

  it("switches the other axis when the combination does not exist", () => {
    expect(variantForOption(ordering, redS, "4")).toBe(blueL);
  });

  it("finds nothing for an option without an in-stock variant", () => {
    expect(variantForOption(ordering, redS, "9")).toBeUndefined();
  });
});

describe("totalStock", () => {
  it("sums the stock of the in-stock variants", () => {
    expect(totalStock(ordering)).toBe(3);
  });

  it("is null when an in-stock variant is untracked", () => {
    expect(totalStock({ ...ordering, variants: [{ ...redS, saleableStock: null }] })).toBeNull();
  });
});
