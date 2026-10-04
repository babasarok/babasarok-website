import type { z } from "zod";
import type {
  Product_MaterialsColors,
  Product_MaterialsPartsFragment,
} from "../../../../tina/__generated__/types";
import {
  MaterialDefinitionSchema,
  type MaterialColorAppearance,
  type MaterialDefinition,
} from "../../material";

export type TinaMaterialSource = Product_MaterialsPartsFragment;
export type TinaMaterialColorSource = Product_MaterialsColors;

type SourceFieldDisposition = "canonical" | "presentation" | "transport";

/**
 * Exhaustive classification of Tina Material properties. A collection schema
 * change updates the generated fragment type and makes this record fail to
 * compile until the new property receives an explicit disposition.
 */
export const MATERIAL_SOURCE_FIELDS = {
  __typename: "transport",
  material_id: "canonical",
  label: "canonical",
  colors: "canonical",
  thumbnail: "presentation",
  categories: "presentation",
  shortDescription: "presentation",
  content: "presentation",
} satisfies Record<keyof TinaMaterialSource, SourceFieldDisposition>;

/** Exhaustive classification of Tina Material-color properties. */
export const MATERIAL_COLOR_SOURCE_FIELDS = {
  __typename: "transport",
  color_id: "canonical",
  label: "canonical",
  hex: "canonical",
  image: "canonical",
} satisfies Record<keyof TinaMaterialColorSource, SourceFieldDisposition>;

export interface MaterialCompileIssue {
  code:
    | "material.color.appearance-conflict"
    | "material.color.appearance-missing"
    | "material.color.duplicate-id"
    | "material.color.null"
    | "material.definition-invalid";
  path: Array<string | number>;
  message: string;
}

export type MaterialCompileResult =
  { success: true; value: MaterialDefinition } | { success: false; issues: MaterialCompileIssue[] };

function compileAppearance(
  color: TinaMaterialColorSource,
  index: number,
  issues: MaterialCompileIssue[]
): MaterialColorAppearance | undefined {
  const hex = color.hex?.trim();
  const image = color.image?.trim();

  if (hex && image) {
    issues.push({
      code: "material.color.appearance-conflict",
      path: ["colors", index],
      message: `A(z) "${color.color_id}" színhez kép és hex szín is tartozik; pontosan az egyiket add meg.`,
    });
    return undefined;
  }

  if (image) {
    return { kind: "image", assetId: image };
  }

  if (hex) {
    return { kind: "hex", value: hex };
  }

  issues.push({
    code: "material.color.appearance-missing",
    path: ["colors", index],
    message: `A(z) "${color.color_id}" színhez kép vagy hex szín szükséges.`,
  });
  return undefined;
}

function zodIssues(error: z.ZodError): MaterialCompileIssue[] {
  return error.issues.map((issue) => ({
    code: "material.definition-invalid",
    path: issue.path.map((part) => (typeof part === "number" ? part : String(part))),
    message: issue.message,
  }));
}

/**
 * Compile one generated Tina Material query result into the strict canonical
 * Material definition. Independent content problems are accumulated so a build
 * reports every color the editor needs to repair at once.
 */
export function compileMaterial(source: TinaMaterialSource): MaterialCompileResult {
  const issues: MaterialCompileIssue[] = [];
  const seenColorIds = new Set<string>();

  const colors = (source.colors ?? []).flatMap((color, index) => {
    if (!color) {
      issues.push({
        code: "material.color.null",
        path: ["colors", index],
        message: "Az anyag színlistája üres elemet tartalmaz.",
      });
      return [];
    }

    const id = color.color_id.trim();
    if (seenColorIds.has(id)) {
      issues.push({
        code: "material.color.duplicate-id",
        path: ["colors", index, "color_id"],
        message: `A(z) "${id}" színazonosító többször szerepel ebben az anyagban.`,
      });
    }
    seenColorIds.add(id);

    const appearance = compileAppearance(color, index, issues);
    return [
      {
        id,
        label: color.label,
        appearance,
      },
    ];
  });

  const parsed = MaterialDefinitionSchema.safeParse({
    id: source.material_id,
    label: source.label,
    colors,
  });

  if (!parsed.success) {
    issues.push(...zodIssues(parsed.error));
  }

  if (issues.length > 0 || !parsed.success) {
    return { success: false, issues };
  }

  return { success: true, value: parsed.data };
}

export function formatMaterialCompileIssues(
  source: Pick<TinaMaterialSource, "material_id" | "label">,
  issues: MaterialCompileIssue[]
): string {
  const heading = `Érvénytelen anyag: "${source.material_id}" (${source.label})`;
  return [
    heading,
    ...issues.map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "anyag";
      return `  - [${issue.code}] ${path}: ${issue.message}`;
    }),
  ].join("\n");
}
