/**
 * One-way seed: Tina material content → Vendure (ADR 0009). Reads
 * src/content/material/*.md, uploads color images as Vendure assets, then
 * creates or updates each material in the vendure-owned catalog. Tina stays
 * the live site's source until cutover; this script is re-runnable (upsert
 * by slug). Asset dedup is per-run only: every run (e.g. each preview
 * deploy) re-uploads every referenced image.
 *
 * TEMPORARY and preview-only: wired into preview deploys only; production
 * is seeded once by a hand-migration directly from the repo at cutover,
 * never by this script (or only run deliberately by a human).
 *
 * Run: pnpm -C backend run import-materials
 * (requires the backend running locally and SUPERADMIN_* in backend/.env)
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { MaterialDefinitionSchema } from "@babasarok/product-definition";
import { parse } from "yaml";
import { z } from "zod";
import { adminRequest, authenticate, uploadAsset } from "./lib/admin-client.ts";

const CONTENT_DIR = path.resolve(import.meta.dirname, "..", "..", "src", "content", "material");
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

const TinaColorSchema = z.object({
  color_id: z.string(),
  label: z.string(),
  hex: z.string().nullish(),
  image: z.string().nullish(),
});

const TinaMaterialSchema = z.object({
  material_id: z.string(),
  label: z.string(),
  colors: z.array(TinaColorSchema).nullish(),
  thumbnail: z.string().nullish(),
  categories: z.string().nullish(),
  shortDescription: z.string().nullish(),
});

type TinaMaterial = z.output<typeof TinaMaterialSchema>;

interface MaterialInput {
  slug: string;
  label: string;
  subtitle: string | null;
  description: string | null;
  thumbnailAssetId: string | null;
  colors: Array<{ id: string; label: string; hex: string | null; assetId: string | null }>;
}

const MaterialsDataSchema = z.object({
  materials: z.array(z.object({ id: z.string(), slug: z.string() })).default([]),
});

function parseFrontmatter(raw: string, file: string): TinaMaterial {
  const match = /^---\n([\s\S]*?)\n---/.exec(raw);

  if (match === null) {
    throw new Error(`${file}: no frontmatter found`);
  }

  const result = TinaMaterialSchema.safeParse(parse(match[1]));

  if (!result.success) {
    throw new Error(
      `${file}: invalid frontmatter — ` +
        result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")
    );
  }

  return result.data;
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();

  if (trimmed === undefined || trimmed === "") {
    return null;
  }

  return trimmed;
}

async function main(): Promise<void> {
  const files = (await readdir(CONTENT_DIR)).filter((file) => file.endsWith(".md"));
  await authenticate();

  const assetIdsByPath = new Map<string, string>();
  const inputs: MaterialInput[] = [];

  for (const file of files) {
    const raw = await readFile(path.join(CONTENT_DIR, file), "utf8");
    const material = parseFrontmatter(raw, file);
    const colors: MaterialInput["colors"] = [];

    for (const color of material.colors ?? []) {
      const hex = color.hex ?? null;

      if (color.image === null || color.image === undefined) {
        colors.push({ id: color.color_id, label: color.label, hex, assetId: null });
        continue;
      }

      const imagePath = path.join(REPO_ROOT, color.image);
      let assetId = assetIdsByPath.get(imagePath);

      if (assetId === undefined) {
        assetId = await uploadAsset(imagePath);
        assetIdsByPath.set(imagePath, assetId);
      }

      colors.push({ id: color.color_id, label: color.label, hex: null, assetId });
    }

    let thumbnailAssetId: string | null = null;

    if (material.thumbnail !== null && material.thumbnail !== undefined) {
      const imagePath = path.join(REPO_ROOT, material.thumbnail);
      const uploaded = assetIdsByPath.get(imagePath);

      thumbnailAssetId = uploaded ?? (await uploadAsset(imagePath));
      assetIdsByPath.set(imagePath, thumbnailAssetId);
    }

    inputs.push({
      slug: material.material_id,
      label: material.label,
      subtitle: trimOrNull(material.categories),
      description: trimOrNull(material.shortDescription),
      thumbnailAssetId,
      colors,
    });
  }

  // Pre-flight against the canonical schema so dirty Tina data (e.g. ids or
  // labels with stray whitespace) is reported instead of round-tripping to
  // the API; such materials are skipped and listed for manual fixing.
  const valid: MaterialInput[] = [];

  for (const input of inputs) {
    const colors = input.colors.map((color) => ({
      id: color.id,
      label: { hu: color.label },
      appearance:
        color.assetId === null
          ? { kind: "hex" as const, value: color.hex ?? "" }
          : { kind: "image" as const, assetId: color.assetId },
    }));
    const result = MaterialDefinitionSchema.safeParse({
      id: input.slug,
      label: { hu: input.label },
      subtitle: input.subtitle === null ? null : { hu: input.subtitle },
      description: input.description === null ? null : { hu: input.description },
      thumbnail: input.thumbnailAssetId === null ? null : { assetId: input.thumbnailAssetId },
      colors,
    });

    if (!result.success) {
      console.error(
        `✗ ${input.slug}: schema violations, skipping —`,
        result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")
      );
      continue;
    }

    valid.push(input);
  }

  const existing = MaterialsDataSchema.parse(
    (await adminRequest(JSON.stringify({ query: "{ materials { id slug } }" }))).data
  );
  const existingIdBySlug = new Map(
    existing.materials.map((material) => [material.slug, material.id])
  );

  let created = 0;
  let updated = 0;

  for (const input of valid) {
    const existingId = existingIdBySlug.get(input.slug);
    const mutation =
      existingId === undefined
        ? `mutation Create($input: MaterialInput!) { createMaterial(input: $input) { id } }`
        : `mutation Update($id: ID!, $input: MaterialInput!) { updateMaterial(id: $id, input: $input) { id } }`;
    const apiInput = {
      slug: input.slug,
      translations: [
        {
          languageCode: "hu",
          label: input.label,
          subtitle: input.subtitle,
          description: input.description,
        },
      ],
      thumbnailAssetId: input.thumbnailAssetId,
      colors: input.colors.map((color) => ({
        id: color.id,
        translations: [{ languageCode: "hu", label: color.label }],
        hex: color.hex,
        assetId: color.assetId,
      })),
    };
    const variables =
      existingId === undefined ? { input: apiInput } : { id: existingId, input: apiInput };
    const result = await adminRequest(JSON.stringify({ query: mutation, variables }));

    if (result.errors.length > 0) {
      console.error(`✗ ${input.slug}:`, result.errors.join("; "));
      continue;
    }

    if (existingId === undefined) {
      created += 1;
    } else {
      updated += 1;
    }
  }

  console.log(
    `materials: ${created} created, ${updated} updated, ` +
      `${valid.length - created - updated} failed, ${inputs.length - valid.length} skipped by schema; ` +
      `${assetIdsByPath.size} images uploaded`
  );
}

try {
  await main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
