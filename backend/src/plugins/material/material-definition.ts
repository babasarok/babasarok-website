import { MaterialDefinitionSchema, type MaterialDefinition } from "@babasarok/product-definition";

export interface MaterialColorInputData {
  id: string;
  label: string;
  hex?: string | null;
  assetId?: string | null;
}

export interface MaterialInputData {
  slug: string;
  label: string;
  subtitle?: string | null;
  description?: string | null;
  thumbnailAssetId?: string | null;
  colors: MaterialColorInputData[];
}

export type MaterialValidationResult =
  { success: true; definition: MaterialDefinition } | { success: false; errors: string[] };

/** Unbranded color shape handed to the canonical schema for parsing. */
interface RawColor {
  id: string;
  label: string;
  appearance: { kind: "hex"; value: string } | { kind: "image"; assetId: string };
}

function appearanceIssue(
  colorId: string,
  hex: string | null,
  assetId: number | null
): string | undefined {
  if (hex !== null && assetId !== null) {
    return `${colorId}: adj meg hex kódot VAGY képet, ne mindkettőt.`;
  }

  if (hex === null && assetId === null) {
    return `${colorId}: kötelező hex kódot vagy képet megadni.`;
  }

  return undefined;
}

/**
 * Validates raw material input against the canonical MaterialDefinitionSchema
 * and repo policy that zod alone cannot see: unique color ids and existing
 * asset references.
 */
export function validateMaterialInput(
  input: MaterialInputData,
  existingAssetIds: ReadonlySet<number>
): MaterialValidationResult {
  const errors: string[] = [];
  const colors: RawColor[] = [];

  for (const color of input.colors) {
    const assetId =
      color.assetId === null || color.assetId === undefined ? null : Number(color.assetId);
    const hex = color.hex ?? null;

    if (Number.isNaN(assetId)) {
      errors.push(`${color.id}: érvénytelen kép azonosító.`);
      continue;
    }

    const issue = appearanceIssue(color.id, hex, assetId);

    if (issue) {
      errors.push(issue);
      continue;
    }

    if (assetId !== null && !existingAssetIds.has(assetId)) {
      errors.push(`${color.id}: a megadott kép nem létezik.`);
      continue;
    }

    colors.push({
      id: color.id,
      label: color.label,
      appearance:
        hex === null ? { kind: "image", assetId: String(assetId) } : { kind: "hex", value: hex },
    });
  }

  const seen = new Set<string>();

  for (const color of colors) {
    if (seen.has(color.id)) {
      errors.push(`${color.id}: Ez az azonosító már létezik a színek/minták között.`);
    }

    seen.add(color.id);
  }

  const rawThumbnailAssetId = input.thumbnailAssetId ?? null;
  const thumbnailAssetId = rawThumbnailAssetId === null ? null : Number(rawThumbnailAssetId);

  if (Number.isNaN(thumbnailAssetId)) {
    errors.push("thumbnail: érvénytelen kép azonosító.");
  } else if (thumbnailAssetId !== null && !existingAssetIds.has(thumbnailAssetId)) {
    errors.push("thumbnail: a megadott kép nem létezik.");
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  const result = MaterialDefinitionSchema.safeParse({
    id: input.slug,
    label: input.label,
    subtitle: input.subtitle ?? null,
    description: input.description ?? null,
    thumbnail: thumbnailAssetId === null ? null : { assetId: String(thumbnailAssetId) },
    colors,
  });

  if (!result.success) {
    return {
      success: false,
      errors: result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    };
  }

  return { success: true, definition: result.data };
}
