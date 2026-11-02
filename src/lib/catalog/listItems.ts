import type { SlimImage } from "@/lib/data";
import { isProductType } from "@/lib/product/productTypes";
import type { ListProduct } from "@/lib/product-list/query";
import { imageSrcSet, imageUrl } from "@/lib/vendure/imageUrl";
import { byPopularity, type CatalogProduct, type CatalogProductGroup } from "./mappers";

export interface ProductListItem extends Omit<ListProduct, "date"> {
  date?: string | undefined;
  href: string;
  category?: string | undefined;
  image?: SlimImage | undefined;
}

export interface ProductListData {
  items: ProductListItem[];
  sets: Array<{ id: string; title: string }>;
  popularOrder: string[];
}

const CARD_SIZES = "(min-width: 1024px) 300px, 250px";

export function cardImage(source: string, assetBase: string): SlimImage {
  return {
    src: imageUrl(source, "card-lg", assetBase),
    srcSet: { attribute: imageSrcSet(source, ["card-sm", "card-lg"], assetBase) },
    attributes: { width: 300, height: 300, sizes: CARD_SIZES, loading: "lazy", decoding: "async" },
  };
}

export function toProductListData(
  products: readonly CatalogProduct[],
  groups: readonly CatalogProductGroup[],
  assetBase: string
): ProductListData {
  const sets = groups.filter((group) => group.kind === "set");
  const visible = byPopularity(
    products.filter((product) => product.definition?.hiddenInProductList !== true)
  );

  const items = visible.map((product): ProductListItem => {
    const id = product.definition?.id ?? product.slug;
    const typeCode = product.type?.code;

    return {
      id,
      title: product.name,
      shortDescription: product.shortDescription,
      type: typeCode !== undefined && isProductType(typeCode) ? typeCode : undefined,
      date: product.date ?? undefined,
      sets: sets.filter((set) => set.productIds.includes(id)).map((set) => set.id),
      href: `/product/${product.slug}/`,
      category: product.tagline ?? undefined,
      image: product.thumbnailUrl ? cardImage(product.thumbnailUrl, assetBase) : undefined,
    };
  });

  return {
    items,
    sets: sets.map((set) => ({ id: set.id, title: set.label })),
    popularOrder: items.map((item) => item.id),
  };
}
