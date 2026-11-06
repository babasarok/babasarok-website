/**
 * Seam: the import script's offline upserts vs. the values the plugins read
 * at runtime. The script cannot import the plugin sources (they carry
 * Vendure decorators; importing them from scripts/ would also pull src into
 * the scripts tsconfig build),
 * so its literals are guarded here instead: this test lives on the src
 * side, imports the real runtime constants from the owning modules and
 * reads the script only as text, failing when its copies drift.
 * `PRODUCT_ID_FILTER_CODE` is Vendure's built-in and needs no guard.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUCT_TYPE_FACET_CODE } from "../product/facet-plan";
import { RELATED_PARENT_SLUG, SET_PARENT_SLUG } from "./group-parents";
import { PRODUCT_SET_ACTION_CODE, PRODUCT_SET_CONDITION_CODE } from "./promotion";

const script = readFileSync(path.resolve(process.cwd(), "scripts", "import-products.ts"), "utf8");

describe("import-products script literals", () => {
  it("match the runtime constants the plugins read", () => {
    for (const value of [
      PRODUCT_SET_CONDITION_CODE,
      PRODUCT_SET_ACTION_CODE,
      PRODUCT_TYPE_FACET_CODE,
      SET_PARENT_SLUG,
      RELATED_PARENT_SLUG,
    ]) {
      expect(script).toContain(`"${value}"`);
    }
  });
});
