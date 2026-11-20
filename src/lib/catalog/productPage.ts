import type { ProductDefinition } from "@babasarok/product-definition";
import { localizedPath, VENDURE_LANGUAGE_CODE, type Locale } from "@/lib/i18n";
import type {
  ConfiguratorProduct,
  ConfiguratorProductGroup,
  ConfiguratorThreadColor,
} from "@/lib/configurator/types";
import type { VendureAsset } from "@/lib/vendure/imageUrl";
import type { Catalog } from "./index";
import { configuratorProducts, type CatalogProduct, type CatalogProductDetail } from "./mappers";
import {
  toConfiguratorGroups,
  toConfiguratorProduct,
  toConfiguratorThreadColors,
} from "./configuratorProduct";
import type { ReadyMadeOrdering } from "./readyMade";

export interface GalleryImage {
  asset: VendureAsset;
  alt: string;
  description?: string | undefined;
}

export interface NavLink {
  href: string;
  label: string;
}

interface ProductPageBase {
  gallery: GalleryImage[];
  previous: NavLink | undefined;
  next: NavLink | undefined;
}

export interface ConfiguratorProductPageData extends ProductPageBase {
  kind: "configurator";
  definition: ProductDefinition;
  configuratorProduct: ConfiguratorProduct;
  configuratorCatalog: Record<string, ConfiguratorProduct>;
  productGroups: ConfiguratorProductGroup[];
  slugByProductId: Record<string, string>;
  threadColors: ConfiguratorThreadColor[];
}

/** A ready-made product has no configurator and is never a set/related member. */
export interface ReadyMadeProductPageData extends ProductPageBase {
  kind: "ready-made";
  ordering: ReadyMadeOrdering;
}

export type ProductPageData = ConfiguratorProductPageData | ReadyMadeProductPageData;

function navLink(product: CatalogProduct | undefined, locale: Locale): NavLink | undefined {
  if (product === undefined) {
    return undefined;
  }

  return { href: localizedPath(`/product/${product.slug}/`, locale), label: product.name };
}

function galleryOf(product: CatalogProductDetail): GalleryImage[] {
  const gallery = product.gallery
    .filter((image) => image.asset.source !== product.thumbnail?.source)
    .map((image) => ({
      asset: image.asset,
      alt: product.name,
      description: image.description ?? undefined,
    }));

  if (product.thumbnail === null) {
    return gallery;
  }

  return [{ asset: product.thumbnail, alt: product.name }, ...gallery];
}

function neighbours(
  product: CatalogProductDetail,
  catalog: Catalog,
  locale: Locale
): Pick<ProductPageBase, "gallery" | "previous" | "next"> {
  const newestFirst = catalog.products.toSorted(
    (a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()
  );
  const index = newestFirst.findIndex((candidate) => candidate.slug === product.slug);

  return {
    gallery: galleryOf(product),
    previous: navLink(newestFirst.slice(0, index).at(-1), locale),
    next: navLink(newestFirst.at(index + 1), locale),
  };
}

/** Everything the product detail page renders, derived from the product and the shared catalog. */
export function toProductPageData(
  product: CatalogProductDetail,
  catalog: Catalog,
  locale: Locale,
  assetBase: string
): ProductPageData {
  const languageCode = VENDURE_LANGUAGE_CODE[locale];

  if (product.ordering.kind === "ready-made") {
    return {
      ...neighbours(product, catalog, locale),
      kind: "ready-made",
      ordering: product.ordering,
    };
  }

  const definition = product.ordering.definition;
  const configurators = configuratorProducts(catalog.products);
  const relatedIds = new Set(
    catalog.groups
      .filter((group) => group.productIds.includes(definition.id))
      .flatMap((group) => group.productIds)
  );

  return {
    ...neighbours(product, catalog, locale),
    kind: "configurator",
    definition,
    configuratorProduct: toConfiguratorProduct(
      product,
      definition,
      catalog.materials,
      assetBase,
      languageCode
    ),
    configuratorCatalog: Object.fromEntries(
      configurators
        .filter((candidate) => relatedIds.has(candidate.ordering.definition.id))
        .map((candidate) => [
          candidate.ordering.definition.id,
          toConfiguratorProduct(
            candidate,
            candidate.ordering.definition,
            catalog.materials,
            assetBase,
            languageCode
          ),
        ])
    ),
    productGroups: toConfiguratorGroups(catalog.groups),
    slugByProductId: Object.fromEntries(
      configurators.map((candidate) => [candidate.ordering.definition.id, candidate.slug])
    ),
    threadColors: toConfiguratorThreadColors(catalog.threadColors, assetBase),
  };
}
