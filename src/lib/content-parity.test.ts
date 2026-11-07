import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CONTENT_ROOT = new URL("../../src/content", import.meta.url).pathname;

// Blog posts created through the Tina editor land at the collection root
// (its filename slugify ignores subfolders); the content helpers treat
// root-level files as hu, so parity counts them as hu.
const ROOT_COUNTS_AS_HU = new Set(["blog"]);

function filePaths(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return filePaths(entryPath);
    }
    return [path.relative(dir, entryPath)];
  });
}

function contentCollections(): string[] {
  return readdirSync(CONTENT_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();
}

describe("per-locale Tina content parity", () => {
  it("has the same files for every locale of every collection", () => {
    const gaps: string[] = [];

    for (const collection of contentCollections()) {
      const base = path.join(CONTENT_ROOT, collection);
      const locales = readdirSync(base, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);

      const huFiles = new Set(filePaths(path.join(base, "hu")));
      if (ROOT_COUNTS_AS_HU.has(collection)) {
        for (const entry of readdirSync(base, { withFileTypes: true })) {
          if (statSync(path.join(base, entry.name)).isFile()) {
            huFiles.add(entry.name);
          }
        }
      }

      for (const locale of locales.filter((candidate) => candidate !== "hu")) {
        const localeFiles = new Set(filePaths(path.join(base, locale)));
        const missingInLocale = [...huFiles].filter((file) => !localeFiles.has(file));
        const missingInHu = [...localeFiles].filter((file) => !huFiles.has(file));

        if (missingInLocale.length) {
          gaps.push(`${collection}/${locale}: missing ${missingInLocale.join(", ")}`);
        }
        if (missingInHu.length) {
          gaps.push(`${collection}/hu: missing ${missingInHu.join(", ")}`);
        }
      }
    }

    expect(gaps, "content translation gaps").toEqual([]);
  });
});
