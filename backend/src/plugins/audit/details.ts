import { canonicalJson } from "../../shared/product-definition/index";
import type {
  MaterialDefinitionInput,
  ProductDefinitionInput,
} from "../../shared/product-definition/index";

/** One changed field: display-ready from/to values (null = added or removed). */
export interface AuditDetail {
  field: string;
  from: string | null;
  to: string | null;
}

/** The native product state the stock form's save is diffed against. */
export interface ProductSnapshot {
  enabled: boolean;
  featuredAssetId: number | null;
  iconId: number | null;
  date: string | null;
  popularityRank: number | null;
  translations: ReadonlyArray<{
    languageCode: string;
    name: string;
    slug: string;
    description: string;
    shortDescription: string | null;
    tagline: string | null;
  }>;
}

const MAX_VALUE_LENGTH = 160;
const MAX_DETAILS = 20;

type Labels = Record<string, string>;
type ValueFormatter = (value: unknown) => string | null;
type ItemFormatter = (item: Record<string, unknown>) => string;

interface EngineConfig {
  labels: Labels;
  /** Value formatters keyed by the field's raw key, `parent.field` more specific. */
  formats: Record<string, ValueFormatter>;
  /** Whole-item formatters for added/removed array entries, keyed like formats. */
  itemFormats: Record<string, ItemFormatter>;
  /** Identity keys tried in order for array items, keyed like formats. */
  arrayKeys: Record<string, ReadonlyArray<string>>;
}

const KIND_LABELS: Record<string, string> = {
  input: "beviteli mező",
  choice: "választó",
  toggle: "kapcsoló",
  material: "anyagválasztó",
  embroidery: "hímzés",
};

const DEFINITION_LABELS: Labels = {
  basePrice: "Alapár",
  pricing: "Árazás",
  fields: "Mezők",
  forbiddenMaterialCombinations: "Tiltott anyag-kombinációk",
  label: "Címke",
  tooltip: "Súgó",
  required: "Kötelező",
  price: "Ár",
  placeholder: "Helyőrző",
  pattern: "Minta (regex)",
  suggestions: "Javaslatok",
  options: "Opciók",
  colorCount: "Színek száma",
  visibility: "Láthatóság",
  materialId: "Anyag",
  sourceFieldId: "Mező",
  fieldId: "Mező",
  value: "Érték",
  count: "Darabszám",
  presentation: "Megjelenés",
  customValue: "Egyéni érték",
};

const MATERIAL_LABELS: Labels = {
  label: "Név",
  subtitle: "Alcím",
  description: "Leírás",
  thumbnail: "Bélyegkép",
  colors: "Színek/minták",
  appearance: "Megjelenés",
  assetId: "Kép azonosító",
  value: "Hex kód",
};

const PRODUCT_LABELS: Labels = {
  enabled: "Rendelhető",
  featuredAssetId: "Fő kép",
  iconId: "Ikon",
  date: "Dátum",
  popularityRank: "Népszerűségi sorrend",
  translations: "Fordítás",
  name: "Név",
  slug: "Webcím",
  description: "Leírás",
  shortDescription: "Rövid leírás",
  tagline: "Alcím",
};

const ENGINE_SKIP = new Set(["id", "revision"]);

export function truncate(value: string): string {
  return value.length > MAX_VALUE_LENGTH ? `${value.slice(0, MAX_VALUE_LENGTH)}…` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLocalizedText(value: unknown): value is Record<string, string> {
  return isRecord(value) && typeof value.hu === "string";
}

function formatLocalizedText(text: Record<string, string>): string {
  const languages = Object.keys(text);

  if (languages.length === 1) {
    const [language] = languages;

    return truncate(text[language]);
  }

  return languages.map((language) => `${language}: ${truncate(text[language])}`).join(" / ");
}

function genericFormat(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "boolean") {
    return value ? "igen" : "nem";
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (typeof value === "string") {
    return truncate(value);
  }

  if (isLocalizedText(value)) {
    return formatLocalizedText(value);
  }

  return truncate(canonicalJson(value));
}

const money: ValueFormatter = (value) =>
  typeof value === "number" ? `${value} Ft` : genericFormat(value);

const assetRef: ValueFormatter = (value) =>
  isRecord(value) && typeof value.assetId === "string"
    ? `kép #${value.assetId}`
    : genericFormat(value);

const assetId: ValueFormatter = (value) =>
  typeof value === "number" ? `kép #${value}` : genericFormat(value);

function formatPricing(value: unknown): string | null {
  if (!isRecord(value)) {
    return genericFormat(value);
  }

  if (value.kind === "unit") {
    return "egységár";
  }

  if (value.kind === "length") {
    return `hossz alapú (mező: ${String(value.sourceFieldId)})`;
  }

  if (value.kind === "flat") {
    return `fix: ${money(value.price)}`;
  }

  if (value.kind === "per-word") {
    return `szavanként: ${money(value.pricePerWord)}`;
  }

  return genericFormat(value);
}

function formatVisibility(value: unknown): string | null {
  if (!isRecord(value)) {
    return genericFormat(value);
  }

  if (value.kind === "always") {
    return "mindig";
  }

  if (value.kind === "when-present") {
    return `ha meg van adva (mező: ${String(value.fieldId)})`;
  }

  if (value.kind === "when-equal") {
    return `ha ${String(value.fieldId)} = ${String(value.value)}`;
  }

  return genericFormat(value);
}

function formatColorCount(value: unknown): string | null {
  if (!isRecord(value)) {
    return genericFormat(value);
  }

  return value.kind === "fixed"
    ? `rögzített: ${String(value.count)}`
    : `mezőből: ${String(value.fieldId)}`;
}

function formatCombinations(value: unknown): string | null {
  if (!Array.isArray(value)) {
    return genericFormat(value);
  }

  return value
    .map((combination) =>
      Array.isArray(combination) ? combination.map(String).join("+") : String(combination)
    )
    .join(", ");
}

function fieldItem(item: Record<string, unknown>): string {
  const label = isRecord(item.label) && typeof item.label.hu === "string" ? item.label.hu : "";
  const kind = KIND_LABELS[String(item.kind)] ?? String(item.kind);

  return `„${label}” (${String(item.id)}, ${kind})`;
}

function colorItem(item: Record<string, unknown>): string {
  const label = isRecord(item.label) && typeof item.label.hu === "string" ? item.label.hu : "";

  return `„${label}” (${String(item.id)})`;
}

function materialOptionItem(item: Record<string, unknown>): string {
  return `${String(item.materialId)}: ${money(item.price)}`;
}

function choiceOptionItem(item: Record<string, unknown>): string {
  const label = isRecord(item.label) && typeof item.label.hu === "string" ? item.label.hu : "";

  return `${label} (${String(item.id)}): ${money(item.price)}`;
}

function suggestionItem(item: Record<string, unknown>): string {
  return String(item.value);
}

function translationItem(item: Record<string, unknown>): string {
  return `${String(item.languageCode)}: ${String(item.name)}`;
}

const DEFINITION_ENGINE: EngineConfig = {
  labels: DEFINITION_LABELS,
  formats: {
    basePrice: money,
    price: money,
    pricePerWord: money,
    pricing: formatPricing,
    visibility: formatVisibility,
    colorCount: formatColorCount,
    appearance: formatAppearance,
    forbiddenMaterialCombinations: formatCombinations,
  },
  itemFormats: {
    fields: fieldItem,
    "material.options": materialOptionItem,
    "choice.options": choiceOptionItem,
    suggestions: suggestionItem,
  },
  arrayKeys: {
    fields: ["id"],
    options: ["materialId", "id"],
    suggestions: [],
    forbiddenMaterialCombinations: [],
  },
};

const MATERIAL_ENGINE: EngineConfig = {
  labels: MATERIAL_LABELS,
  formats: {
    thumbnail: assetRef,
    appearance: formatAppearance,
  },
  itemFormats: {
    colors: colorItem,
  },
  arrayKeys: {
    colors: ["id"],
  },
};

const PRODUCT_ENGINE: EngineConfig = {
  labels: PRODUCT_LABELS,
  formats: {
    featuredAssetId: assetId,
    iconId: assetId,
  },
  itemFormats: {
    translations: translationItem,
  },
  arrayKeys: {
    translations: ["languageCode"],
  },
};

function formatAppearance(value: unknown): string | null {
  if (!isRecord(value)) {
    return genericFormat(value);
  }

  return value.kind === "hex" ? String(value.value) : `kép #${String(value.assetId)}`;
}

/** The config entry for the key at the end of `parents`: `a.b` beats `b`. */
function resolveEntry<T>(table: Record<string, T>, parents: ReadonlyArray<string>): T | undefined {
  const key = parents.at(-1) ?? "";
  const parent = parents.at(-2);

  if (parent !== undefined && Object.hasOwn(table, `${parent}.${key}`)) {
    return table[`${parent}.${key}`];
  }

  return table[key];
}

/** Which config entry names the array's identity: the parent-qualified one wins. */
function arrayKeyFor(
  config: EngineConfig,
  parents: ReadonlyArray<string>
): ReadonlyArray<string> | undefined {
  return resolveEntry(config.arrayKeys, parents);
}

function localizedKeys(before: Record<string, string>, after: Record<string, string>): string[] {
  return [
    ...Object.keys(before),
    ...Object.keys(after).filter((language) => !Object.hasOwn(before, language)),
  ];
}

function unionKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return [
    ...Object.keys(before),
    ...Object.keys(after).filter((key) => !Object.hasOwn(before, key)),
  ];
}

function detail(
  field: string,
  format: ValueFormatter,
  before: unknown,
  after: unknown
): AuditDetail {
  return { field, from: format(before), to: format(after) };
}

function diffNode(
  config: EngineConfig,
  parents: string[],
  path: string,
  before: unknown,
  after: unknown
): AuditDetail[] {
  if (canonicalJson(before) === canonicalJson(after)) {
    return [];
  }

  if (isLocalizedText(before) && isLocalizedText(after)) {
    return localizedKeys(before, after).flatMap((language) =>
      diffNode(config, parents, `${path} (${language})`, before[language], after[language])
    );
  }

  // A nullish (absent or null) localized value behaves as "no language set" so
  // a first-time subtitle reads as `Alcím (hu): — → …`, not as a whole-value
  // replacement.
  if ((before === null || before === undefined) && isLocalizedText(after)) {
    return localizedKeys({}, after).flatMap((language) =>
      diffNode(config, parents, `${path} (${language})`, null, after[language])
    );
  }

  if ((after === null || after === undefined) && isLocalizedText(before)) {
    return localizedKeys(before, {}).flatMap((language) =>
      diffNode(config, parents, `${path} (${language})`, before[language], null)
    );
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    return diffArrays(config, parents, path, before, after);
  }

  if (isRecord(before) && isRecord(after)) {
    const beforeKind = before.kind;
    const afterKind = after.kind;

    if (
      typeof beforeKind === "string" &&
      typeof afterKind === "string" &&
      beforeKind !== afterKind
    ) {
      return [detail(path, resolveEntry(config.formats, parents) ?? genericFormat, before, after)];
    }

    return unionKeys(before, after)
      .filter((key) => !ENGINE_SKIP.has(key))
      .flatMap((key) => {
        const label = config.labels[key] ?? key;
        const childPath = path === "" ? label : `${path} / ${label}`;

        return diffNode(config, [...parents, key], childPath, before[key], after[key]);
      });
  }

  const key = parents.at(-1) ?? "";
  const format = resolveEntry(config.formats, parents) ?? genericFormat;

  return [detail(path === "" ? key : path, format, before, after)];
}

function diffArrays(
  config: EngineConfig,
  parents: string[],
  path: string,
  before: ReadonlyArray<unknown>,
  after: ReadonlyArray<unknown>
): AuditDetail[] {
  const identityKeys = arrayKeyFor(config, parents);

  if (identityKeys === undefined || identityKeys.length === 0) {
    const format = resolveEntry(config.formats, parents) ?? genericFormat;

    return [detail(path, format, before, after)];
  }

  const keyOf = (item: unknown): string | undefined => {
    if (!isRecord(item)) {
      return undefined;
    }

    const key = identityKeys.find((candidate) => candidate in item);

    return key === undefined ? undefined : String(item[key]);
  };
  const formatItem = (item: Record<string, unknown>): string =>
    resolveEntry(config.itemFormats, parents)?.(item) ?? genericFormat(item) ?? "";

  const afterKeys = new Set(after.map(keyOf));
  const beforeKeys = new Set(before.map(keyOf));
  const added = after.filter((item) => !beforeKeys.has(keyOf(item)));
  const matched = after.flatMap((afterItem) => {
    const key = keyOf(afterItem);
    const beforeItem =
      key === undefined ? undefined : before.find((candidate) => keyOf(candidate) === key);

    return beforeItem === undefined ? [] : [[beforeItem, afterItem] as const];
  });
  const removed = before.filter((item) => !afterKeys.has(keyOf(item)));

  return [
    // One-sided entries name the item in their value already, so the path
    // stays at the array itself — no phantom reference to an id that exists
    // on only one side of the change.
    ...added.flatMap((item) => {
      const key = keyOf(item);

      return isRecord(item) && key !== undefined
        ? [{ field: path, from: null, to: formatItem(item) }]
        : [];
    }),
    ...matched.flatMap(([beforeItem, afterItem]) => {
      const key = keyOf(afterItem);

      return key === undefined
        ? []
        : diffNode(config, parents, `${path} / ${key}`, beforeItem, afterItem);
    }),
    ...removed.flatMap((item) => {
      const key = keyOf(item);

      return isRecord(item) && key !== undefined
        ? [{ field: path, from: formatItem(item), to: null }]
        : [];
    }),
  ];
}

/** Bounds a long diff so one save cannot flood the log. */
export function capDetails(details: AuditDetail[]): AuditDetail[] {
  if (details.length <= MAX_DETAILS) {
    return details;
  }

  const hidden = details.length - MAX_DETAILS;

  return [
    ...details.slice(0, MAX_DETAILS),
    { field: `… további ${hidden} változás`, from: null, to: null },
  ];
}

export function definitionDetails(
  before: ProductDefinitionInput,
  after: ProductDefinitionInput
): AuditDetail[] {
  return capDetails(diffNode(DEFINITION_ENGINE, [], "", before, after));
}

export function materialDetails(
  before: MaterialDefinitionInput,
  after: MaterialDefinitionInput
): AuditDetail[] {
  return capDetails(diffNode(MATERIAL_ENGINE, [], "", before, after));
}

export function productDetails(before: ProductSnapshot, after: ProductSnapshot): AuditDetail[] {
  return capDetails(diffNode(PRODUCT_ENGINE, [], "", before, after));
}
