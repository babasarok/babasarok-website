import { memberIds } from "./set-basket";

export interface ProductGroupCollection {
  slug: string;
  name: string;
  filters: ReadonlyArray<{
    code: string;
    args: ReadonlyArray<{ name: string; value: string }>;
  }>;
}

export interface ProductGroupProjection {
  id: string;
  kind: "set" | "related";
  label: string;
  discount: number | null;
  productIds: string[];
}

/**
 * The shop-visible projection of a related-items collection: member definition
 * ids only. Groups with fewer than two known members are dropped.
 */
export function projectGroups(
  collections: readonly ProductGroupCollection[],
  productIdByNativeId: ReadonlyMap<number, string>
): ProductGroupProjection[] {
  const groups: ProductGroupProjection[] = [];

  for (const collection of collections) {
    const productIds = [
      ...new Set(
        (memberIds(collection.filters) ?? []).flatMap((nativeId) => {
          const productId = productIdByNativeId.get(Number(nativeId));

          return productId === undefined ? [] : [productId];
        })
      ),
    ];

    if (productIds.length < 2) {
      continue;
    }

    groups.push({
      id: collection.slug,
      kind: "related",
      label: collection.name,
      discount: null,
      productIds,
    });
  }

  return groups;
}
