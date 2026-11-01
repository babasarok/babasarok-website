import { describe, expect, it } from "vitest";
import { previewApiUrl } from "../preview-url";

describe("previewApiUrl", () => {
  it("derives the API host from the branch via the shared slug function", () => {
    expect(previewApiUrl({ branch: "fix/my_branch!", stack: "preview" })).toBe(
      "https://api-fix-my-branch.babasarok.net"
    );
  });

  it("is undefined outside a preview build (local and prod keep their env)", () => {
    expect(previewApiUrl({ branch: "some-branch" })).toBeUndefined();
    expect(previewApiUrl({ branch: "some-branch", stack: "prod" })).toBeUndefined();
    expect(previewApiUrl({ stack: "preview" })).toBeUndefined();
  });

  it("fails loudly when a preview build has no usable branch", () => {
    expect(() => previewApiUrl({ branch: "prod", stack: "preview" })).toThrow(/derive the API URL/);
  });
});
