/** Line specs for the fixture products: one builder per product, taking what the buyer picks. */
import type { MaterialSlug } from "./fixtures";
import { materialSelection, type LineSpec } from "./shop";

interface Pick {
  material: MaterialSlug;
  color?: string;
}

function pick({ material, color = "feher" }: Pick): ReturnType<typeof materialSelection> {
  return materialSelection(material, color);
}

export function parna(
  material: Pick,
  options: { quantity?: number; szegely?: boolean; meret?: "kicsi" | "nagy" } = {}
): LineSpec {
  const meret = options.meret ?? "kicsi";

  return {
    sku: "int-parna",
    quantity: options.quantity ?? 1,
    selections: {
      anyag: pick(material),
      szegely: { kind: "option", value: options.szegely === true ? "igen" : "nem" },
      meret: { kind: "option", value: meret },
    },
  };
}

export function takaro(material: Pick, quantity = 1): LineSpec {
  return {
    sku: "int-takaro",
    quantity,
    selections: { anyag: pick(material) },
  };
}

export function feszek(kulso: Pick, belso: Pick, quantity = 1): LineSpec {
  return {
    sku: "int-feszek",
    quantity,
    selections: { kulso: pick(kulso), belso: pick(belso) },
  };
}

export function szalag(lengthCm: number, quantity = 1): LineSpec {
  return { sku: "int-szalag", quantity, lengthCm };
}

export function kendo(quantity = 1): LineSpec {
  return { sku: "int-kendo", quantity };
}

export function elavulo(material: Pick, meret: "kicsi" | "nagy" = "kicsi", quantity = 1): LineSpec {
  return {
    sku: "int-elavulo",
    quantity,
    selections: { anyag: pick(material), meret: { kind: "option", value: meret } },
  };
}
