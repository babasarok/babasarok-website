import { describe, expect, it } from "vitest";
import { ThreadColorPaletteSchema } from "./thread-color";

describe("ThreadColorPaletteSchema", () => {
  const hexColor = { id: "feher", label: "Fehér", appearance: { kind: "hex", value: "#FFFFFF" } };
  const imageColor = {
    id: "mintas",
    label: "Mintás",
    appearance: { kind: "image", assetId: "/mintas.webp" },
  };

  it("parses a palette with one hex and one image color", () => {
    expect(ThreadColorPaletteSchema.safeParse([hexColor, imageColor]).success).toBe(true);
  });

  it("rejects an empty palette", () => {
    expect(ThreadColorPaletteSchema.safeParse([]).success).toBe(false);
  });

  it("rejects an unknown key", () => {
    expect(ThreadColorPaletteSchema.safeParse([{ ...hexColor, extra: true }]).success).toBe(false);
  });
});
