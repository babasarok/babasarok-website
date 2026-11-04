import { describe, expect, it } from "vitest";
import { RELATED_PARENT_SLUG, SET_PARENT_SLUG } from "./group-parents";
import { groupParentViolation } from "./group-parent-guard";

describe("groupParentViolation", () => {
  it("allows deleting a regular collection", () => {
    expect(groupParentViolation("akciok", { type: "delete" })).toBeUndefined();
  });

  it("blocks deleting a group parent and says why", () => {
    const message = groupParentViolation(SET_PARENT_SLUG, { type: "delete" });

    expect(message).toContain(SET_PARENT_SLUG);
    expect(message).toContain("szett-kedvezmény");
  });

  it("blocks moving a group parent", () => {
    const message = groupParentViolation(RELATED_PARENT_SLUG, { type: "move" });

    expect(message).toContain(RELATED_PARENT_SLUG);
    expect(message).toContain("kapcsolódó termékek");
  });

  it("allows editing a group parent without a slug change", () => {
    expect(
      groupParentViolation(SET_PARENT_SLUG, { type: "update-slug", incomingSlug: SET_PARENT_SLUG })
    ).toBeUndefined();
  });

  it("blocks renaming a group parent and says why", () => {
    const message = groupParentViolation(SET_PARENT_SLUG, {
      type: "update-slug",
      incomingSlug: "setek",
    });

    expect(message).toContain("slug");
    expect(message).toContain("szett-kedvezmény");
  });

  it("allows renaming a regular collection", () => {
    expect(
      groupParentViolation("akciok", { type: "update-slug", incomingSlug: "mas-nev" })
    ).toBeUndefined();
  });
});
