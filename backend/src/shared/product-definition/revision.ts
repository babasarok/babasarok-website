import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical-json";
import { ProductRevisionSchema, type ProductRevision } from "./model";
import type { ProductDefinition, ProductDefinitionInput } from "./product";

/**
 * The deterministic definition revision: a sha256 over the canonical
 * definition's commerce-relevant facts (the `revision` field itself is
 * stripped first, so the hash never depends on its value). The server sets it
 * on every save; the seed and the dashboard import the same function instead
 * of carrying copies.
 */
export function productRevision(
  definition: ProductDefinitionInput | ProductDefinition
): ProductRevision {
  const { revision: _ignored, ...facts } = definition;

  return ProductRevisionSchema.parse(
    createHash("sha256").update(canonicalJson(facts)).digest("hex")
  );
}
