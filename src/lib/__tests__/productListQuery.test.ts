/**
 * Product list view state: URL query-param parsing/serialization and the
 * filter/sort it applies to the product list. See ADR 0004 and
 * docs/specs/product-catalog.md — "Product list: search, filtering, and
 * sorting".
 */
import { describe, expect, it } from "vitest";
import {
  applyListState,
  DEFAULT_LIST_STATE as defaultState,
  parseListState,
  serializeListState,
  type ListProduct,
  type ProductListViewState,
} from "@/lib/product-list/query";
import type { ProductType } from "@/lib/product/productTypes";

describe("parseListState", () => {
  it("returns the default state for an empty search", () => {
    expect(parseListState("")).toEqual({
      q: "",
      types: [],
      sets: [],
      sort: "newest",
    });
  });

  it("parses all params (repeated keys for multi-values)", () => {
    expect(
      parseListState("?q=minky&type=takaro&type=racsvedo&set=ovis-szett&set=babafeszek&sort=name")
    ).toEqual({
      q: "minky",
      types: ["takaro", "racsvedo"],
      sets: ["ovis-szett", "babafeszek"],
      sort: "name",
    });
  });

  it("ignores unknown types and sort values", () => {
    expect(parseListState("?q=x&type=takaro&type=nincs&sort=price")).toEqual({
      q: "x",
      types: ["takaro"],
      sets: [],
      sort: "newest",
    });
  });

  it("passes set ids through (an unknown id matches nothing at apply time)", () => {
    expect(parseListState("?set=real-set&set=ghost")).toEqual({
      q: "",
      types: [],
      sets: ["real-set", "ghost"],
      sort: "newest",
    });
  });

  it("treats a q with spaces as literal text", () => {
    expect(parseListState("?q=%C3%B3voda%20zs%C3%A1k")).toEqual({
      q: "óvoda zsák",
      types: [],
      sets: [],
      sort: "newest",
    });
  });
});

describe("serializeListState", () => {
  const state: ProductListViewState = {
    q: "minky",
    types: ["takaro", "racsvedo"],
    sets: ["ovis-szett"],
    sort: "name",
  };

  it("serializes the default state to an empty string", () => {
    expect(serializeListState({ q: "", types: [], sets: [], sort: "newest" })).toBe("");
  });

  it("serializes all state (repeated keys for multi-values)", () => {
    expect(serializeListState(state)).toBe(
      "?q=minky&type=takaro&type=racsvedo&set=ovis-szett&sort=name"
    );
  });

  it("round-trips through parseListState", () => {
    expect(parseListState(serializeListState(state))).toEqual(state);
  });
});

describe("applyListState", () => {
  const day = (iso: string): Date => new Date(iso);
  const product = (over: {
    title: string;
    shortDescription?: string;
    type?: ProductType;
    date?: Date;
    sets?: string[];
  }): ListProduct => ({
    id: over.title,
    title: over.title,
    shortDescription: over.shortDescription,
    type: over.type ?? "takaro",
    date: over.date,
    sets: over.sets ?? [],
  });

  it("matches the search text against the title, case-insensitively", () => {
    const products = [product({ title: "Kánikulatakaró" }), product({ title: "Pólya" })];
    expect(applyListState(products, { ...defaultState, q: "kánikula" })).toHaveLength(1);
    expect(applyListState(products, { ...defaultState, q: "KÁNIKULA" })).toHaveLength(1);
  });

  it("matches the search text against the short description", () => {
    const products = [
      product({ title: "Pólya", shortDescription: "Puha minky pólya" }),
      product({ title: "Pálka" }),
    ];
    expect(applyListState(products, { ...defaultState, q: "minky" })).toHaveLength(1);
  });

  it("returns nothing when the search matches nothing", () => {
    const products = [product({ title: "Pólya" })];
    expect(applyListState(products, { ...defaultState, q: "nemlétező" })).toEqual([]);
  });

  it("ORs the selected types", () => {
    const products = [
      product({ title: "A", type: "takaro" }),
      product({ title: "B", type: "racsvedo" }),
      product({ title: "C", type: "parna" }),
    ];
    const result = applyListState(products, { ...defaultState, types: ["takaro", "racsvedo"] });
    expect(result.map((p) => p.title)).toEqual(["A", "B"]);
  });

  it("ORs the selected sets by membership", () => {
    const products = [
      product({ title: "A", sets: ["ovis-szett"] }),
      product({ title: "B", sets: ["babafeszek"] }),
      product({ title: "C", sets: [] }),
    ];
    const result = applyListState(products, {
      ...defaultState,
      sets: ["ovis-szett", "babafeszek"],
    });
    expect(result.map((p) => p.title)).toEqual(["A", "B"]);
  });

  it("ANDs the type and set dimensions", () => {
    const products = [
      product({ title: "A", type: "takaro", sets: ["ovis-szett"] }),
      product({ title: "B", type: "takaro", sets: [] }),
      product({ title: "C", type: "racsvedo", sets: ["ovis-szett"] }),
      product({ title: "D", type: "parna", sets: ["ovis-szett"] }),
    ];
    const result = applyListState(products, {
      ...defaultState,
      types: ["takaro"],
      sets: ["ovis-szett"],
    });
    expect(result.map((p) => p.id)).toEqual(["A"]);
  });

  it("ANDs the dimensions with the search text", () => {
    const products = [
      product({ title: "Takaró minky", type: "takaro" }),
      product({ title: "Rácsvédő minky", type: "racsvedo" }),
      product({ title: "Takaró pamut", type: "takaro" }),
    ];
    const result = applyListState(products, {
      ...defaultState,
      q: "minky",
      types: ["takaro"],
    });
    expect(result.map((p) => p.title)).toEqual(["Takaró minky"]);
  });

  it("keeps input order for newest sort when dates are missing or equal", () => {
    const products = [
      product({ title: "No date" }),
      product({ title: "Old", date: day("2025-01-01") }),
      product({ title: "Same", date: day("2025-06-01") }),
      product({ title: "Same2", date: day("2025-06-01") }),
      product({ title: "New", date: day("2026-01-01") }),
    ];
    const result = applyListState(products, defaultState);
    expect(result.map((p) => p.title)).toEqual([
      "New",
      "Same",
      "Same2",
      "Old",
      "No date",
    ]);
  });

  it("sorts by name ascending using the Hungarian locale", () => {
    const products = [
      product({ title: "Zsák" }),
      product({ title: "Állat" }),
      product({ title: "Babafészek" }),
    ];
    const result = applyListState(products, { ...defaultState, sort: "name" });
    expect(result.map((p) => p.title)).toEqual(["Állat", "Babafészek", "Zsák"]);
  });

  it("does not mutate the input", () => {
    const products = [product({ title: "B" }), product({ title: "A" })];
    applyListState(products, { ...defaultState, sort: "name" });
    expect(products.map((p) => p.title)).toEqual(["B", "A"]);
  });
});
