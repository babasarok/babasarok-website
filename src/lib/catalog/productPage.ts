import type { ProductDefinition } from "@babasarok/product-definition";
import { localizedPath, VENDURE_LANGUAGE_CODE, type Locale } from "@/lib/i18n";
import type { OrderProduct, OrderProductGroup, OrderThreadColor } from "@/lib/order/types";
import type { VendureAsset } from "@/lib/vendure/imageUrl";
import type { Catalog } from "./index";
import type { CatalogProduct, CatalogProductDetail } from "./mappers";
import { toOrderGroups, toOrderProduct, toOrderThreadColors } from "./orderProduct";

export interface GalleryImage {
  asset: VendureAsset;
  alt: string;
  description?: string | undefined;
}

export interface NavLink {
  href: string;
  label: string;
}

export interface ProductPageData {
  definition: ProductDefinition;
  orderProduct: OrderProduct;
  orderCatalog: Record<string, OrderProduct>;
  productGroups: OrderProductGroup[];
  slugByProductId: Record<string, string>;
  threadColors: OrderThreadColor[];
  gallery: GalleryImage[];
  previous: NavLink | undefined;
  next: NavLink | undefined;
}

function navLink(product: CatalogProduct | undefined, locale: Locale): NavLink | undefined {
  if (product === undefined) {
    return undefined;
  }

  return { href: localizedPath(`/product/${product.slug}/`, locale), label: product.name };
}

function galleryOf(product: CatalogProductDetail): GalleryImage[] {
  const gallery = product.gallery.map((image) => ({
    asset: image.asset,
    alt: product.name,
    description: image.description ?? undefined,
  }));

  if (gallery.length === 0 && product.thumbnail !== null) {
    return [{ asset: product.thumbnail, alt: product.name }];
  }

  return gallery;
}

/** Everything the product detail page renders, derived from the product and the shared catalog. */
export function toProductPageData(
  product: CatalogProductDetail,
  catalog: Catalog,
  locale: Locale,
  assetBase: string
): ProductPageData {
  const languageCode = VENDURE_LANGUAGE_CODE[locale];
  const { definition } = product;
  const newestFirst = catalog.products.toSorted(
    (a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()
  );
  const index = newestFirst.findIndex((candidate) => candidate.slug === product.slug);
  const relatedIds = new Set(
    catalog.groups
      .filter((group) => group.productIds.includes(definition.id))
      .flatMap((group) => group.productIds)
  );

  return {
    definition,
    orderProduct: toOrderProduct(product, catalog.materials, assetBase, languageCode),
    orderCatalog: Object.fromEntries(
      catalog.products
        .filter((candidate) => relatedIds.has(candidate.definition.id))
        .map((candidate) => [
          candidate.definition.id,
          toOrderProduct(candidate, catalog.materials, assetBase, languageCode),
        ])
    ),
    productGroups: toOrderGroups(catalog.groups),
    slugByProductId: Object.fromEntries(
      catalog.products.map((candidate) => [candidate.definition.id, candidate.slug])
    ),
    threadColors: toOrderThreadColors(catalog.threadColors, assetBase),
    gallery: galleryOf(product),
    previous: navLink(newestFirst.slice(0, index).at(-1), locale),
    next: navLink(newestFirst.at(index + 1), locale),
  };
}
