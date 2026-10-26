import { describe, expect, it } from "vitest";
import { previewSlug } from "../preview-slug";

describe("previewSlug", () => {
  it("sanitises a branch into the shared slug identity", () => {
    expect(previewSlug("fix/my_branch!")).toBe("fix-my-branch");
    expect(previewSlug("Feature//Two--Words")).toBe("feature-two-words");
    expect(previewSlug("-already-clean-")).toBe("already-clean");
  });

  it("caps at 40 chars and trims a trailing dash left by the cap", () => {
    expect(previewSlug("x".repeat(41))).toBe("x".repeat(40));
    expect(previewSlug(`${"x".repeat(39)}-y`)).toBe("x".repeat(39));
  });

  it("fails closed on unusable slugs", () => {
    expect(() => previewSlug("!!!")).toThrow(/unusable slug/);
    for (const reserved of ["prod", "test", "infra"]) {
      expect(() => previewSlug(reserved)).toThrow(/unusable slug/);
    }
  });
});
