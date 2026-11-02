import { describe, expect, it } from "vitest";
import {
  COLOR_FACET_CODE,
  MATERIAL_FACET_CODE,
  colorFacetValueCode,
  materialFacetValues,
  plannedVariantFacetCodes,
  staleColorFacetValueCodes,
} from "./facet-plan";
import type { MaterialFacetData } from "./facet-plan";
import type { VariantPlan } from "./variant-plan";

const wellsoft: MaterialFacetData = {
  label: { hu: "Wellsoft" },
  colors: [
    { id: "barna", label: { hu: "Barna" } },
    { id: "kek", label: { hu: "Kék" } },
  ],
};
const velur: MaterialFacetData = {
  label: { hu: "Velúr" },
  colors: [{ id: "barna", label: { hu: "Barna" } }],
};
const waffle: MaterialFacetData = { label: { hu: "Waffle" }, colors: [] };

const materialData = new Map([
  ["wellsoft", wellsoft],
  ["velur", velur],
  ["waffle", waffle],
]);

describe("materialFacetValues", () => {
  it("demands the material value plus one value per color", () => {
    expect(materialFacetValues({ slug: "wellsoft", ...wellsoft })).toEqual([
      { facetCode: MATERIAL_FACET_CODE, code: "wellsoft", name: { hu: "Wellsoft" } },
      { facetCode: COLOR_FACET_CODE, code: "wellsoft--barna", name: { hu: "Barna" } },
      { facetCode: COLOR_FACET_CODE, code: "wellsoft--kek", name: { hu: "Kék" } },
    ]);
  });

  it("demands no color values for a colorless material", () => {
    expect(materialFacetValues({ slug: "waffle", ...waffle }).map((value) => value.code)).toEqual([
      "waffle",
    ]);
  });
});

describe("colorFacetValueCode", () => {
  it("scopes the color to its material", () => {
    expect(colorFacetValueCode("wellsoft", "barna")).toBe("wellsoft--barna");
  });
});

describe("staleColorFacetValueCodes", () => {
  it("finds only the material's own removed colors", () => {
    expect(
      staleColorFacetValueCodes(
        "wellsoft",
        ["barna"],
        ["wellsoft--barna", "wellsoft--kek", "velur--barna", "wellsoft"]
      )
    ).toEqual(["wellsoft--kek"]);
  });

  it("matches the material part before the first separator, not by prefix", () => {
    expect(
      staleColorFacetValueCodes("gyapju", [], ["gyapju2--barna", "gyapju--extra--barna"])
    ).toEqual(["gyapju--extra--barna"]);
  });
});

describe("plannedVariantFacetCodes", () => {
  const plan: VariantPlan = {
    optionGroups: [],
    bannedOmitted: 0,
    variants: [
      {
        sku: "p--wellsoft",
        name: { hu: "p" },
        price: 0,
        optionCodes: [],
        materialSlugs: ["wellsoft"],
      },
      {
        sku: "p--dupla",
        name: { hu: "p" },
        price: 0,
        optionCodes: [],
        materialSlugs: ["wellsoft", "wellsoft"],
      },
      {
        sku: "p--vegyes",
        name: { hu: "p" },
        price: 0,
        optionCodes: [],
        materialSlugs: ["velur", "waffle"],
      },
      {
        sku: "p--ismeretlen",
        name: { hu: "p" },
        price: 0,
        optionCodes: [],
        materialSlugs: ["torolt"],
      },
    ],
  };

  it("carries the chosen materials and all their colors, deduplicated", () => {
    expect(plannedVariantFacetCodes(plan, materialData).get("p--dupla")).toEqual([
      "wellsoft",
      "wellsoft--barna",
      "wellsoft--kek",
    ]);
    expect(plannedVariantFacetCodes(plan, materialData).get("p--wellsoft")).toEqual([
      "wellsoft",
      "wellsoft--barna",
      "wellsoft--kek",
    ]);
  });

  it("mixes a colorless material in without color values", () => {
    expect(plannedVariantFacetCodes(plan, materialData).get("p--vegyes")).toEqual([
      "velur",
      "velur--barna",
      "waffle",
    ]);
  });

  it("leaves unknown materials to the facet-value resolution error", () => {
    expect(plannedVariantFacetCodes(plan, materialData).get("p--ismeretlen")).toEqual(["torolt"]);
  });
});
