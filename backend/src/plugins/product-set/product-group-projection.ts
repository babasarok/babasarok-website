import { memberIds, type SetCollection } from "./set-basket";

export interface ProductGroupCollection {
  slug: string;
  name: string;
  filters: SetCollection["filters"];
  setDiscount: number | null;
}

export interface ProductGroupProjection {
  id: string;
  kind: "set" | "related";
  label: string;
  discount: number | null;
  productIds: string[];
}

/**
 * The shop-visible projection of a group collection: member definition ids
 * only. Groups with fewer than two known members are dropped, as are sets
 * without a positive discount (they could never form a discounted instance).
 */
export function projectGroups(
  kind: ProductGroupProjection["kind"],
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
    const discount = collection.setDiscount;

    if (productIds.length < 2) {
      continue;
    }

    if (kind === "set" && (discount === null || discount <= 0)) {
      continue;
    }

    groups.push({
      id: collection.slug,
      kind,
      label: collection.name,
      discount: kind === "set" ? discount : null,
      productIds,
    });
  }

  return groups;
}
