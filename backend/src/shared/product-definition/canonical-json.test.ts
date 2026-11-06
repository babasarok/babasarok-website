import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical-json.ts";

describe("canonicalJson", () => {
  it("sorts object keys in code-unit order, independent of the ICU locale", () => {
    const json = canonicalJson({ cz: 1, cs: 2, ZZ: 3, a_b: 4, ab: 5, aa: 6 });

    expect(json).toBe(`{"ZZ":3,"a_b":4,"aa":6,"ab":5,"cs":2,"cz":1}`);
  });
});
