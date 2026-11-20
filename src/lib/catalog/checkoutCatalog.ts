import type { Labels } from "@/lib/basket/lineRows";
import { setMembersByGroup, type SetMembers } from "@/lib/basket/setDiscounts";
import { configuratorProducts } from "./mappers";
import type { Catalog } from "./index";

export interface CheckoutCatalog {
  labels: Labels;
  setMembers: SetMembers;
}

/** The catalog names the checkout shows next to each basket line. */
export function toCheckoutCatalog(catalog: Catalog): CheckoutCatalog {
  return {
    labels: {
      materials: Object.fromEntries(
        catalog.materials.map((material) => [
          material.slug,
          {
            label: material.label,
            colors: Object.fromEntries(material.colors.map((color) => [color.id, color.label])),
          },
        ])
      ),
      threadColors: Object.fromEntries(
        catalog.threadColors.map((color) => [color.id, color.label])
      ),
    },
    setMembers: setMembersByGroup(
      catalog.groups,
      configuratorProducts(catalog.products).map((product) => ({
        slug: product.slug,
        name: product.name,
        definitionId: product.ordering.definition.id,
      }))
    ),
  };
}
