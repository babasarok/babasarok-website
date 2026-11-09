/**
 * Seam: the translations script (backend/scripts/translations) vs. the real
 * admin API. Its reads and its update inputs (translations arrays, the
 * material input that replaces colors, definition JSON) are hand-written
 * GraphQL that no type checks against the schema, and the upload paces itself
 * on the real definition-sync queue. One run adds a language to every entity
 * kind it handles, leaves Hungarian untouched and is a no-op when re-run.
 * It also covers the material sync giving the material collection a new
 * language (a collection translation needs a description, NOT NULL).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { readCatalogSnapshot, type AdminApi } from "../scripts/translations/catalog-snapshot";
import {
  translatableStrings,
  type TranslatableString,
} from "../scripts/translations/translatable-strings";
import type { TranslationFile } from "../scripts/translations/upload-plan";
import { runUpload, verifyUpload } from "../scripts/translations/upload";
import { seedCatalog } from "./fixtures";
import { run, startServer, type IntegrationServer } from "./harness";

let server: IntegrationServer;
let api: AdminApi;

const OPTIONS = { force: false, pollMs: 250, syncTimeoutMs: 120_000 };

async function strings(language: string): Promise<TranslatableString[]> {
  return translatableStrings(await readCatalogSnapshot(api, { definitions: true }), language);
}

beforeAll(async () => {
  server = await startServer();
  api = { request: (query, variables, schema) => run(server.admin, query, variables, schema) };
  await seedCatalog(server);
  await run(
    server.admin,
    `mutation($input: CreateFacetInput!) { createFacet(input: $input) { id } }`,
    {
      input: {
        code: "int-tipus",
        isPrivate: false,
        translations: [{ languageCode: "hu", name: "Típus" }],
        values: [{ code: "parna", translations: [{ languageCode: "hu", name: "Párna" }] }],
      },
    },
    z.unknown()
  );
});

afterAll(async () => {
  await server.stop();
});

describe("translations upload", () => {
  it("adds a language to every entity kind, leaves Hungarian alone and re-runs as a no-op", async () => {
    const before = await strings("de");
    const file: TranslationFile = {
      language: "de",
      strings: before
        .filter((string) => !string.derived && string.current === undefined)
        .map(({ key, source }) => ({ key, source, translation: `DE ${source}` })),
    };

    expect(new Set(file.strings.map((entry) => entry.key.split("|")[0]))).toEqual(
      new Set([
        "product",
        "material",
        "materialColor",
        "facet",
        "facetValue",
        "collection",
        "promotion",
        "shippingMethod",
        "definition",
      ])
    );

    await runUpload(api, file, { ...OPTIONS, write: false, log: () => {} });

    expect((await strings("de")).filter((string) => string.current !== undefined)).toEqual([]);

    await runUpload(api, file, { ...OPTIONS, write: true, log: () => {} });
    await verifyUpload(api, file, () => {});

    const after = await strings("de");

    expect(after.map(({ key, source }) => [key, source])).toEqual(
      expect.arrayContaining(before.map(({ key, source }) => [key, source]))
    );
    expect(after.filter((string) => string.derived && string.current === undefined)).toEqual([]);

    const rerun: string[] = [];

    await runUpload(api, file, {
      ...OPTIONS,
      write: true,
      log: (line) => {
        rerun.push(line);
      },
    });

    expect(rerun[0]).toBe(
      `planned 0 write(s) in 0 mutation(s), ${file.strings.length} already live: {}`
    );
  });
});
