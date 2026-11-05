/** Code-unit order: every sort that feeds a hash or equality check must not follow the ICU locale. */
export function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** JSON with recursively sorted object keys, so hashes never depend on key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }

  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).toSorted(([a], [b]) => byCodeUnit(a, b));

    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }

  if (value === undefined) {
    return "null";
  }

  return JSON.stringify(value);
}
