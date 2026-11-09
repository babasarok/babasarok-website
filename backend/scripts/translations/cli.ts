/**
 * Adds a language's translations to the live catalog in three steps:
 *
 *   pnpm -C backend run translations extract --lang de --out translations/de.json
 *   (fill every "translation" in the file; have the owner review it)
 *   pnpm -C backend run translations upload --file translations/de.json            # dry run
 *   pnpm -C backend run translations upload --file translations/de.json --write
 *   pnpm -C backend run translations verify --file translations/de.json
 *
 * Needs ADMIN_API_URL, SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD. Uploads are
 * additive (missing translations only) and re-runnable after an abort.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { parseArgs } from "node:util";
import { adminRequest, authenticate } from "../lib/admin-client";
import { readCatalogSnapshot, type AdminApi } from "./catalog-snapshot";
import { translatableStrings } from "./translatable-strings";
import { TranslationFileSchema, type TranslationFile } from "./upload-plan";
import { runUpload, verifyUpload } from "./upload";

const RETRIES = 10;

/** Network failures and non-JSON (proxy 502) pages: an API restart takes 1–2 minutes. */
async function withRetries<T>(send: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await send();
    } catch (error: unknown) {
      if (attempt >= RETRIES) {
        throw error;
      }

      const waitMs = Math.min(2000 * 2 ** attempt, 30_000);

      console.error(`request failed (${String(error)}); retry ${attempt + 1} in ${waitMs} ms`);
      await sleep(waitMs);
    }
  }
}

const api: AdminApi = {
  async request(query, variables, schema) {
    const result = await withRetries(() => adminRequest(JSON.stringify({ query, variables })));

    if (result.errors.length > 0) {
      throw new Error(`GraphQL: ${result.errors.join("; ")}`);
    }

    return schema.parse(result.data);
  },
};

async function signIn(): Promise<void> {
  const missing = ["ADMIN_API_URL", "SUPERADMIN_EMAIL", "SUPERADMIN_PASSWORD"].filter(
    (name) => !process.env[name]
  );

  if (missing.length > 0) {
    throw new Error(`missing environment: ${missing.join(", ")}.`);
  }

  await authenticate();
}

function readTranslationFile(path: string): TranslationFile {
  return TranslationFileSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

async function extract(language: string, out: string): Promise<void> {
  const snapshot = await readCatalogSnapshot(api, { definitions: true });
  const missing = translatableStrings(snapshot, language).filter(
    (string) => string.current === undefined
  );
  const file = TranslationFileSchema.parse({
    language,
    strings: missing.map(({ key, source }) => ({ key, source, translation: "" })),
  });

  writeFileSync(out, `${JSON.stringify(file, null, 2)}\n`, { flag: "wx" });
  console.log(`${missing.length} untranslated string(s) written to ${out}.`);
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      lang: { type: "string" },
      out: { type: "string" },
      file: { type: "string" },
      write: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
    },
  });
  const [command] = positionals;
  const { lang, out, file } = values;

  if (command === "extract" && lang !== undefined && out !== undefined) {
    await signIn();
    await extract(lang, out);
    return;
  }

  if (command === "upload" && file !== undefined) {
    const translations = readTranslationFile(file);

    await signIn();
    await runUpload(api, translations, {
      write: values.write,
      force: values.force,
      log: (line) => {
        console.log(line);
      },
      pollMs: 2000,
      syncTimeoutMs: 20 * 60_000,
    });
    return;
  }

  if (command === "verify" && file !== undefined) {
    const translations = readTranslationFile(file);

    await signIn();
    await verifyUpload(api, translations, (line) => {
      console.log(line);
    });
    return;
  }

  throw new Error(
    "usage: translations extract --lang <code> --out <file> | upload --file <file> [--write] [--force] | verify --file <file>"
  );
}

try {
  await main();
} catch (error: unknown) {
  console.error(`STOP: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
