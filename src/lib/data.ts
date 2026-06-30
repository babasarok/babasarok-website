/**
 * Per-collection data loaders + the data shapes they return.
 *
 * Loaders call the generated Tina client and pipe the result through
 * `requestWithMetadata()` so the editor overlay flows in when the page
 * renders inside the admin iframe and `tinaField()` has its metadata.
 *
 * Types below are pure derivations — no hand-written shapes. Each one is
 * either inferred from a loader's return type (`CmsConfig`/`CmsPage`/
 * `CmsBlog`) or `Extract`/index-accessed off those. The Tina collection
 * is the source of truth; regen with `tinacms dev` and everything
 * downstream updates.
 */
import type { ImageMetadata } from "astro";
import { requestWithMetadata } from "@tinacms/astro/data";
import client from "../../tina/__generated__/client";
import { resolveImage } from "./assets";

/**
 * Return a plain, serialization-safe copy of an `ImageMetadata`.
 *
 * Astro serializes client-island props with a `[type, value]` tuple scheme that
 * only recurses into *plain* objects. SVG `ImageMetadata` (Astro's SVG import)
 * is an exotic, non-plain object, so Astro emits its fields as bare values
 * instead of tuples; the island's `reviveTuple` then does `const [t, v] = raw`
 * on a bare value and throws "x is not iterable" while hydrating, which silently
 * kills the whole island (no icons, no interactivity). Spreading into a fresh
 * object literal yields a plain `[object Object]` Astro can round-trip.
 *
 * Only used for data that crosses into the OrderForm island; `.astro` `<Image>`
 * usage keeps the original metadata so the image pipeline is untouched.
 */
function plainImage(meta: ImageMetadata | undefined): ImageMetadata | undefined {
  return meta ? { ...meta } : undefined;
}

/**
 * Resolve image URLs embedded in a Tina rich-text body to local optimized
 * assets. Tina rich-text `img` nodes carry a `url` that, in cloud builds, is an
 * absolute Tina Cloud CDN URL; left untouched it would be serialized into a
 * client island's props and hot-link to Tina Cloud (see
 * scripts/test/no-tina-cloud-urls.ts). `resolveImage` already normalizes both
 * the cloud (`.../__file/<path>`) and local (`/src/assets/<path>`) forms, so we
 * walk the value and swap each `img` node's `url` for the hashed local `src`.
 *
 * Only nodes shaped like `{ type: "img", url }` are touched; every other value
 * (link hrefs, resolved `ImageMetadata` fields, plain strings) is passed
 * through unchanged, so the generic walk is safe to run over a whole entity.
 */
function resolveRichTextImages<T>(value: T): T {
  if (Array.isArray(value)) {
    return (value as unknown[]).map((item) => resolveRichTextImages(item)) as T;
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(source)) {
      result[key] = resolveRichTextImages(val);
    }
    if (source.type === "img" && typeof source.url === "string") {
      result.url = resolveImage(source.url)?.src ?? source.url;
    }
    return result as T;
  }
  return value;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const getConfig = async () => {
  const result = await requestWithMetadata(client.queries.config({ relativePath: "config.json" }));

  return {
    ...result,
    data: {
      ...result.data,
      config: {
        ...result.data.config,
        logo: resolveImage(result.data.config.logo),
        footerLogo: resolveImage(result.data.config.footerLogo),
      },
    },
  };
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const getProducts = async () => {
  const result = await client.queries.productConnection();

  const products = result.data.productConnection.edges?.flatMap((edge) =>
    edge?.node ? [edge.node] : []
  );

  return (
    products
      ?.toSorted((a, b) => a.title.localeCompare(b.title))
      .map((product) =>
        resolveRichTextImages({
          ...product,
          icon: plainImage(resolveImage(product.icon)),
          thumbnail: plainImage(resolveImage(product.thumbnail)),
          images: product.images?.map((entry) =>
            entry ? { ...entry, image: plainImage(resolveImage(entry.image)) } : entry
          ),
          materials: product.materials
            ? {
                ...product.materials,
                materials: product.materials.materials?.map((material) =>
                  material
                    ? {
                        ...material,
                        material_path: {
                          ...material.material_path,
                          thumbnail: plainImage(resolveImage(material.material_path.thumbnail)),
                          colors: material.material_path.colors?.map((color) =>
                            color
                              ? { ...color, image: plainImage(resolveImage(color.image)) }
                              : color
                          ),
                        },
                      }
                    : material
                ),
              }
            : product.materials,
        })
      ) ?? []
  );
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const getMaterials = async () => {
  const result = await client.queries.product_materialsConnection();

  const materials = result.data.product_materialsConnection.edges?.flatMap((edge) =>
    edge?.node ? [edge.node] : []
  );

  return (
    materials
      ?.toSorted((a, b) => a.label.localeCompare(b.label))
      .map((material) =>
        resolveRichTextImages({
          ...material,
          thumbnail: plainImage(resolveImage(material.thumbnail)),
          colors: material.colors?.map((color) =>
            color ? { ...color, image: plainImage(resolveImage(color.image)) } : color
          ),
        })
      ) ?? []
  );
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const getDeliveryMethods = async () => {
  const result = await client.queries.delivery_methodsConnection();

  const deliveryMethods = result.data.delivery_methodsConnection.edges?.flatMap((edge) =>
    edge?.node ? [edge.node] : []
  );

  return deliveryMethods ?? [];
};

export type CmsConfig = Awaited<ReturnType<typeof getConfig>>["data"]["config"];
export type CmsProduct = Awaited<ReturnType<typeof getProducts>>[number];
export type CmsMaterial = Awaited<ReturnType<typeof getMaterials>>[number];
export type CmsDeliveryMethod = Awaited<ReturnType<typeof getDeliveryMethods>>[number];
