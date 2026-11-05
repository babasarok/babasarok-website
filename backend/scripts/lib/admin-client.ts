import { openAsBlob } from "node:fs";
import path from "node:path";
import { z } from "zod";

const API_URL = `http://localhost:${process.env.PORT ?? "4000"}/admin-api`;
// Undici's own headersTimeout is 300s; ours must fire first to fail with a
// clear message instead of UND_ERR_HEADERS_TIMEOUT.
const REQUEST_TIMEOUT_MS = 240_000;

const MIME_TYPES: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const CreateAssetsDataSchema = z.object({
  createAssets: z
    .array(z.object({ id: z.string().optional(), message: z.string().optional() }))
    .optional(),
});

let authToken: string | null = null;

export async function adminRequest(
  body: FormData | string
): Promise<{ data: unknown; errors: string[]; codes: string[] }> {
  const headers: Record<string, string> = { "Apollo-Require-Preflight": "true" };

  if (typeof body === "string") {
    headers["Content-Type"] = "application/json";
  }

  if (authToken !== null) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(API_URL, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const tokenHeader = response.headers.get("vendure-auth-token");

  if (tokenHeader !== null) {
    authToken = tokenHeader;
  }

  const result = z
    .object({
      data: z.unknown().optional(),
      errors: z
        .array(
          z.object({ message: z.string(), extensions: z.object({ code: z.string() }).optional() })
        )
        .optional(),
    })
    .parse(await response.json());

  return {
    data: result.data,
    errors: result.errors?.map((error) => error.message) ?? [],
    codes: result.errors?.map((error) => error.extensions?.code ?? "") ?? [],
  };
}

export async function authenticate(): Promise<void> {
  // ponytail: the fallbacks duplicate vendure-config's superadmin defaults;
  // ../src/env parses the whole server env (DATABASE_URL, TOKEN_SECRET, …)
  // at import, which the import scripts do not have.
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
    })
  );

  if (authToken === null) {
    const refusal = z
      .object({ authenticate: z.object({ message: z.string() }) })
      .safeParse(result.data);
    const reason = refusal.success ? refusal.data.authenticate.message : result.errors.join("; ");

    throw new Error(`login failed: ${reason || "unknown error"}`);
  }
}

export async function uploadAsset(filePath: string): Promise<string> {
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
  // openAsBlob returns a Promise — FormData.append rejects one, and the
  // part's Content-Type (the Asset's stored mimeType) comes from the Blob
  // type, which openAsBlob leaves empty unless told.
  const blob = await openAsBlob(filePath, {
    type: MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "",
  });
  form.append("0", blob, fileName);

  const created = CreateAssetsDataSchema.parse((await adminRequest(form)).data).createAssets?.[0];

  if (created?.id === undefined) {
    throw new Error(`asset upload failed for ${filePath}: ${created?.message ?? "unknown error"}`);
  }

  return created.id;
}
