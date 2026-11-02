import { LanguageCode } from "@vendure/core";
import { describe, expect, it } from "vitest";
import { MaterialTranslation } from "./material.entity";

describe("material entities", () => {
  it("keep constructor input on decorated fields (TranslatableSaver builds them this way)", () => {
    const translation = new MaterialTranslation({ languageCode: LanguageCode.hu, label: "Pamut" });

    expect(translation.languageCode).toBe(LanguageCode.hu);
    expect(translation.label).toBe("Pamut");
  });
});
