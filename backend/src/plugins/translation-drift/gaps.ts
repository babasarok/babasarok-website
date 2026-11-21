import { isLocalizedTextShape } from "../../shared/product-definition/localized-text";

export interface TranslationGap {
  entityType: string;
  entityKey: string;
  entityLabel: string;
  field: string;
  fieldLabel: string;
  huValue: string;
}

export interface DefinitionTextGap {
  path: string;
  hu: string;
}

/** A field needs its English translation when the Hungarian source has text
 * and the English value is missing or empty. */
export function missingTranslation(hu?: string | null, en?: string | null): boolean {
  return (hu ?? "").trim() !== "" && (en ?? "").trim() === "";
}

/** Every LocalizedText object inside a definition JSON whose `en` is missing.
 * Array items carrying a string `id` are addressed by that id (fields,
 * options), so paths survive reordering; id-less items fall back to their
 * index (suggestions). */
export function definitionTextGaps(definition: unknown): DefinitionTextGap[] {
  const gaps: DefinitionTextGap[] = [];

  walkTexts(definition, [], gaps);

  return gaps;
}

function hasStringId(item: unknown): item is { id: string } {
  return typeof item === "object" && item !== null && "id" in item && typeof item.id === "string";
}

function arraySegment(item: unknown, index: number): string {
  if (hasStringId(item)) {
    return item.id;
  }

  return String(index);
}

/** A copy of the definition whose localized text at `path` carries `value`
 * under `language`. Array segments address an item by its string `id` when
 * one matches, else by index. Throws when the path does not address a
 * localized text or when the Hungarian source changed since the gap was
 * listed (`expectedHu`). */
export function withEnAtPath<T>(
  definition: T,
  path: string,
  language: string,
  value: string,
  expectedHu?: string | null
): T {
  const clone = structuredClone(definition);
  const segments = path.split(".");
  const node = nodeAt(clone, segments, path);

  if (!isLocalizedTextShape(node)) {
    throw new Error(`A mező nem fordítható szöveg: ${path}`);
  }

  if (expectedHu !== undefined && expectedHu !== null && node.hu !== expectedHu) {
    throw new Error(`A szöveg időközben megváltozott, töltsd újra az oldalt: ${path}`);
  }

  Reflect.set(node, language, value);

  return clone;
}

function arrayEntry(items: readonly unknown[], segment: string, path: string): unknown {
  const byId = items.find((item) => hasStringId(item) && item.id === segment);

  if (byId !== undefined) {
    return byId;
  }

  const index = Number(segment);

  if (!Number.isInteger(index) || index < 0 || index >= items.length) {
    throw new Error(`Érvénytelen útvonal a definícióban: ${path}`);
  }

  return items[index];
}

function nodeAt(root: unknown, segments: string[], path: string): unknown {
  let node: unknown = root;

  for (const segment of segments) {
    if (Array.isArray(node)) {
      node = arrayEntry(node, segment, path);
      continue;
    }

    if (typeof node === "object" && node !== null && Reflect.has(node, segment)) {
      node = Reflect.get(node, segment);
      continue;
    }

    throw new Error(`Érvénytelen útvonal a definícióban: ${path}`);
  }

  return node;
}

function walkTexts(node: unknown, path: string[], gaps: DefinitionTextGap[]): void {
  if (Array.isArray(node)) {
    for (const [index, child] of node.entries()) {
      walkTexts(child, [...path, arraySegment(child, index)], gaps);
    }

    return;
  }

  if (isLocalizedTextShape(node)) {
    if (missingTranslation(node.hu, node.en)) {
      gaps.push({ path: path.join("."), hu: node.hu });
    }

    return;
  }

  if (typeof node === "object" && node !== null) {
    for (const [key, child] of Object.entries(node)) {
      walkTexts(child, [...path, key], gaps);
    }
  }
}
