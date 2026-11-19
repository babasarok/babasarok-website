import type { ProductDefinition } from "@babasarok/product-definition";
import type { OrderLine } from "./schemas";

/** How a basket line was ordered, as the catalog's `ordering`: a configurator line's product carries its definition. */
export type LineKind =
  { kind: "configurator"; definition: ProductDefinition } | { kind: "ready-made" };

export function lineKind(line: OrderLine): LineKind {
  const definition = line.productVariant.product.productDefinition;

  if (definition === null) {
    return { kind: "ready-made" };
  }

  return { kind: "configurator", definition };
}
