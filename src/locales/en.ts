type ShapeOf<T> = T extends string ? string : { [K in keyof T]: ShapeOf<T[K]> };

// Key completeness is checked against the Hungarian source of truth;
// additive English keys (e.g. plural forms hu does not use) stay allowed.
const translation = {
  languageNames: { hu: "Magyar", en: "English" },
} as const satisfies ShapeOf<typeof import("./hu").default>;

export default translation;
