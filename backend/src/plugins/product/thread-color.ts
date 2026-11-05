const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function hexColorError(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  if (typeof value !== "string" || !HEX_COLOR.test(value)) {
    return "A színkód #rrggbb formátumú lehet (pl. #9caf88).";
  }

  return undefined;
}

export function unknownThreadColorRejection(colorIds: readonly string[]): string {
  return `Ismeretlen hímzőcérna-szín: ${colorIds.join(", ")}.`;
}
