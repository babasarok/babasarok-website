/**
 * The typed field-value accessor (issue #15). Three consumers — pricing
 * (length source), material color-count and `depends_on` visibility — resolve a
 * field reference to its value through here, narrowing on `kind` instead of
 * coercing a raw string. These tests lock that contract in one place.
 */
import { describe, expect, it } from "vitest";
import { findFieldByName, resolveFieldValue, resolveNumericValue } from "@/lib/product/fieldValue";
import { makeField } from "./fixtures";

describe("resolveFieldValue", () => {
  it("is empty for a missing field", () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(resolveFieldValue(undefined)).toEqual({ kind: "empty" });
  });

  it("is empty for an embroidery field (no scalar to reference)", () => {
    const field = makeField({ name: "himzes", type: "embroidery" });
    expect(resolveFieldValue(field)).toEqual({ kind: "empty" });
  });

  it("resolves a toggle to a boolean", () => {
    const field = makeField({ name: "csomag", type: "toggle", value: { value: true } });
    expect(resolveFieldValue(field)).toEqual({ kind: "boolean", value: true });
  });

  it("resolves a filled string field to a string", () => {
    const field = makeField({ name: "nev", type: "input", value: { value: "Anna" } });
    expect(resolveFieldValue(field)).toEqual({ kind: "string", value: "Anna" });
  });

  it("collapses a blank string value to empty", () => {
    const field = makeField({ name: "nev", type: "input", value: { value: "" } });
    expect(resolveFieldValue(field)).toEqual({ kind: "empty" });
  });
});

describe("resolveNumericValue", () => {
  it("parses a numeric string value", () => {
    const field = makeField({ name: "meret", type: "radio", value: { value: "300" } });
    expect(resolveNumericValue(field)).toBe(300);
  });

  it("is undefined for a non-numeric string", () => {
    const field = makeField({ name: "meret", type: "radio", value: { value: "nagy" } });
    expect(resolveNumericValue(field)).toBeUndefined();
  });

  it("is undefined for a toggle (non-string value)", () => {
    const field = makeField({ name: "csomag", type: "toggle", value: { value: true } });
    expect(resolveNumericValue(field)).toBeUndefined();
  });

  it("is undefined for a missing field", () => {
    // eslint-disable-next-line unicorn/no-useless-undefined
    expect(resolveNumericValue(undefined)).toBeUndefined();
  });
});

describe("findFieldByName", () => {
  it("finds a field by its name", () => {
    const a = makeField({ name: "a", type: "input" });
    const b = makeField({ name: "b", type: "input" });
    expect(findFieldByName([a, b], "b")).toBe(b);
  });

  it("returns undefined when no field matches", () => {
    const a = makeField({ name: "a", type: "input" });
    expect(findFieldByName([a], "nincs")).toBeUndefined();
  });
});
