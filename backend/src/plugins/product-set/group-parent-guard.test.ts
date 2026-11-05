import { describe, expect, it } from "vitest";
import { RELATED_PARENT_SLUG, SET_PARENT_SLUG } from "./group-parents";
import { groupParentViolation, updateSlugViolation } from "./group-parent-guard";

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

describe("updateSlugViolation", () => {
  const stored = [
    { languageCode: "hu", slug: SET_PARENT_SLUG },
    { languageCode: "en", slug: "sets" },
  ];

  it("allows updates that leave every stored slug unchanged", () => {
    expect(
      updateSlugViolation(stored, [
        { languageCode: "hu", slug: SET_PARENT_SLUG },
        { languageCode: "en", slug: "sets" },
      ])
    ).toBeUndefined();
  });

  it("allows translations without a slug or without a stored counterpart", () => {
    expect(
      updateSlugViolation(stored, [{ languageCode: "hu" }, { languageCode: "de", slug: "sets-de" }])
    ).toBeUndefined();
  });

  it("blocks renaming a stored slug of a group parent", () => {
    const message = updateSlugViolation(stored, [{ languageCode: "hu", slug: "setek" }]);

    expect(message).toContain(SET_PARENT_SLUG);
    expect(message).toContain("szett-kedvezmény");
  });

  it("blocks renaming a regular collection only via the stored slug of a group parent", () => {
    expect(updateSlugViolation(stored, [{ languageCode: "en", slug: "new-slug" }])).toBeUndefined();
  });
});
