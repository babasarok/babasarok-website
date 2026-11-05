/**
 * Seeds the two owner-maintained facets (ADR 0011 decisions 2 and 3):
 * the public product-type facet with the seven current types, and the private
 * thread-color facet from src/content/config/embroidery.json (read-only Tina
 * data). Idempotent: creates what is missing and leaves owner edits alone.
 * Reports thread colors that have neither a hex nor a swatch.
 *
 * Product-type assignment happens in import-products (it knows the native
 * products). Preview deploys run this before import-products; production runs
 * it once by hand at cutover.
 *
 * Run: pnpm -C backend run import-facets
 * (requires the backend running locally and SUPERADMIN_* in backend/.env)
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { adminRequest, authenticate } from "./lib/admin-client.ts";
import { ensureFacetWithValues } from "./lib/facet-seed.ts";

const EMBROIDERY_PATH = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "src",
  "content",
  "config",
  "embroidery.json"
);

// Mirrors src/lib/product/productTypes.ts until the site cutover deletes it;
// the container has no src/lib, so the seed carries its own copy.
const PRODUCT_TYPES = [
  { code: "racsvedo", name: "Rácsvédő" },
  { code: "takaro", name: "Takaró" },
  { code: "lepedo", name: "Lepedő / fektető" },
  { code: "parna", name: "Párna" },
  { code: "babafeszek", name: "Babafészek" },
  { code: "zsak", name: "Zsák és tároló" },
  { code: "kiegeszito", name: "Kiegészítő" },
];

const EmbroideryConfigSchema = z.object({
  colors: z.array(z.object({ color_id: z.string(), label: z.string(), hex: z.string().nullish() })),
});

async function main(): Promise<void> {
  await authenticate();

  const types = await ensureFacetWithValues(
    adminRequest,
    { code: "babasarok-product-type", name: "Terméktípus", isPrivate: false },
    PRODUCT_TYPES
  );
  console.log(`product types: ${types.created} created`);

  const config = EmbroideryConfigSchema.parse(JSON.parse(await readFile(EMBROIDERY_PATH, "utf8")));
  const colors = await ensureFacetWithValues(
    adminRequest,
    { code: "babasarok-thread-color", name: "Cérna színek", isPrivate: true },
    config.colors.map((color) => ({
      code: color.color_id.trim(),
      name: color.label.trim(),
      ...(color.hex ? { hex: color.hex.trim() } : {}),
    }))
  );
  console.log(`thread colors: ${colors.created} created`);

  for (const [code, value] of colors.valuesByCode) {
    if (value.hex === null && !value.hasSwatch) {
      console.error(`⚠ cérnaszín "${code}": nincs színkód és nincs minta`);
    }
  }
}

try {
  await main();
} catch (error: unknown) {
  console.error(error);
  process.exit(1);
}
