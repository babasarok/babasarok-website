import { describe, expect, it } from "vitest";
import { deletedNativeProductId } from "./product-event";

type ProductEventShape = { type: "created" | "updated" | "deleted"; entity: { id: number } };

describe("deletedNativeProductId", () => {
  it("returns the entity id of a deleted product", () => {
    expect(deletedNativeProductId(event("deleted", 41))).toBe(41);
  });

  it("ignores created and updated events", () => {
    expect(deletedNativeProductId(event("created", 41))).toBeUndefined();
    expect(deletedNativeProductId(event("updated", 41))).toBeUndefined();
  });

  it("ignores a non-numeric entity id", () => {
    expect(
      deletedNativeProductId({ type: "deleted", entity: { id: "not-a-number" } })
    ).toBeUndefined();
  });
});

function event(type: "created" | "updated" | "deleted", id: number): ProductEventShape {
  return { type, entity: { id } };
}
