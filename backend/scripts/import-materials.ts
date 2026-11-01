/**
 * One-way seed: Tina material content → Vendure (ADR 0009). Reads
 * src/content/material/*.md, uploads color images as Vendure assets, then
 * creates or updates each material in the vendure-owned catalog. Tina stays
 * the live site's source until cutover; this script is re-runnable (upsert
 * by material id, images deduplicated by file path).
 *
 * Run: pnpm -C backend run import-materials
 * (requires the backend running locally and SUPERADMIN_* in backend/.env)
 */
import { openAsBlob } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { MaterialDefinitionSchema } from "@babasarok/product-definition";
import { parse } from "yaml";

const API_URL = `http://localhost:${process.env.PORT ?? "4000"}/admin-api`;
const CONTENT_DIR = path.resolve(import.meta.dirname, "..", "..", "src", "content", "material");
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");

interface TinaColor {
  color_id: string;
  label: string;
  hex?: string | null;
  image?: string | null;
}

interface TinaMaterial {
  material_id: string;
  label: string;
  colors?: TinaColor[] | null;
}

interface MaterialInput {
  id: string;
  label: string;
  colors: Array<{ id: string; label: string; hex: string | null; assetId: string | null }>;
}

function parseFrontmatter(raw: string): unknown {
  const match = /^---\n([\s\S]*?)\n---/.exec(raw);

  if (match === null) {
    throw new Error("no frontmatter found");
  }

  return parse(match[1]);
}

let authToken: string | null = null;

async function adminRequest(
  body: FormData | string,
  contentType?: string
): Promise<{ data?: Record<string, unknown>; errors?: Array<{ message: string }> }> {
  const headers: Record<string, string> = { "Apollo-Require-Preflight": "true" };

  if (authToken !== null) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  if (contentType !== undefined) {
    headers["Content-Type"] = contentType;
  }

  const response = await fetch(API_URL, { method: "POST", headers, body });
  const tokenHeader = response.headers.get("vendure-auth-token");

  if (tokenHeader !== null) {
    authToken = tokenHeader;
  }

  return (await response.json()) as {
    data?: Record<string, unknown>;
    errors?: Array<{ message: string }>;
  };
}

async function authenticate(): Promise<void> {
  // Same fallback as vendure-config's superadminCredentials: previews don't
  // carry SUPERADMIN_* in their .env, so the bootstrap defaults apply there.
  const email = process.env.SUPERADMIN_EMAIL ?? "admin@babasarok.local";
  const password = process.env.SUPERADMIN_PASSWORD ?? "superadmin";
  const result = await adminRequest(
    JSON.stringify({
      query: `mutation Login($username: String!, $password: String!) {
        authenticate(input: { native: { username: $username, password: $password } }) {
          ... on CurrentUser { id }
          ... on ErrorResult { errorCode message }
        }
      }`,
      variables: { username: email, password },
    }),
    "application/json"
  );

  const error = (result.data as { authenticate?: { message?: string } } | undefined)?.authenticate
    ?.message;

  if (authToken === null) {
    throw new Error(`login failed: ${error ?? JSON.stringify(result.errors)}`);
  }
}

async function uploadAsset(filePath: string): Promise<string> {
  const fileName = path.basename(filePath);
  const form = new FormData();
  form.append(
    "operations",
    JSON.stringify({
      query: `mutation UploadAsset($files: [CreateAssetInput!]!) {
        createAssets(input: $files) {
          ... on Asset { id name }
          ... on MimeTypeError { errorCode message }
        }
      }`,
      variables: { files: [{ file: null }] },
    })
  );
  form.append("map", JSON.stringify({ 0: ["variables.files.0.file"] }));
  form.append("0", openAsBlob(filePath), fileName);

  const result = await adminRequest(form);
  const created = (
    result.data as { createAssets?: Array<{ id?: string; message?: string }> } | undefined
  )?.createAssets?.[0];

  if (created?.id === undefined) {
    throw new Error(`asset upload failed for ${filePath}: ${created?.message ?? "unknown error"}`);
  }

  return created.id;
}

async function main(): Promise<void> {
  const files = (await readdir(CONTENT_DIR)).filter((file) => file.endsWith(".md"));
  await authenticate();

  const assetIdsByPath = new Map<string, string>();
  const inputs: MaterialInput[] = [];

  for (const file of files) {
    const raw = await readFile(path.join(CONTENT_DIR, file), "utf8");
    const material = parseFrontmatter(raw) as TinaMaterial;
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

    inputs.push({ id: material.material_id, label: material.label, colors });
  }

  // Pre-flight against the canonical schema so dirty Tina data (e.g. ids or
  // labels with stray whitespace) is reported instead of round-tripping to
  // the API; such materials are skipped and listed for manual fixing.
  const valid: MaterialInput[] = [];

  for (const input of inputs) {
    const colors = input.colors.map((color) => ({
      id: color.id,
      label: color.label,
      appearance:
        color.assetId === null
          ? { kind: "hex" as const, value: color.hex ?? "" }
          : { kind: "image" as const, assetId: color.assetId },
    }));
    const result = MaterialDefinitionSchema.safeParse({
      id: input.id,
      label: input.label,
      colors,
    });

    if (!result.success) {
      console.error(
        `✗ ${input.id}: schema violations, skipping —`,
        result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")
      );
      continue;
    }

    valid.push(input);
  }

  const existing = (
    await adminRequest(JSON.stringify({ query: "{ materials { id } }" }), "application/json")
  ).data as { materials: Array<{ id: string }> } | undefined;
  const existingIds = new Set(existing?.materials.map((material) => material.id) ?? []);

  let created = 0;
  let updated = 0;

  for (const input of valid) {
    const exists = existingIds.has(input.id);
    const mutation = exists
      ? `mutation Update($id: ID!, $input: MaterialInput!) { updateMaterial(id: $id, input: $input) { id } }`
      : `mutation Create($input: MaterialInput!) { createMaterial(input: $input) { id } }`;
    const variables = exists ? { id: input.id, input } : { input };
    const result = await adminRequest(
      JSON.stringify({ query: mutation, variables }),
      "application/json"
    );

    if (result.errors !== undefined && result.errors.length > 0) {
      console.error(`✗ ${input.id}:`, result.errors.map((error) => error.message).join("; "));
      continue;
    }

    if (exists) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  console.log(
    `materials: ${created} created, ${updated} updated, ` +
      `${valid.length - created - updated} failed, ${inputs.length - valid.length} skipped by schema; ` +
      `${assetIdsByPath.size} images uploaded`
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
