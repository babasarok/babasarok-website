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
import { getImage } from "astro:assets";
import { requestWithMetadata } from "@tinacms/astro/data";
import client from "../../tina/__generated__/client";
import { resolveImage } from "./assets";
import {
  AssertTrue,
  type IfEquals,
  type RecursivelyNullableToUndefined,
  type RecursivelyRemoveKeys,
} from "./typeUtils";
import type { InferEntrySchema } from "astro:content";

type CmsDeliveryMethod = RecursivelyNullableToUndefined<
  RecursivelyRemoveKeys<
    Awaited<ReturnType<typeof client.queries.delivery_methods>>["data"]["delivery_methods"],
    `_${string}`
  >
>;

interface CmsEnhancedDeliveryMethod extends Omit<CmsDeliveryMethod, "id"> {}

type CmsMaterial = RecursivelyRemoveKeys<
  Awaited<ReturnType<typeof client.queries.product_materials>>["data"]["product_materials"],
  `_${string}`
>;

interface CmsEnhancedMaterial extends Omit<CmsMaterial, "id" | "thumbnail"> {
  thumbnail?: ImageMetadata;
  colors?: Array<
    Omit<CmsMaterial["colors"][number], "image"> & {
      image?: ImageMetadata;
    }
  >;
}
type CmsProduct = RecursivelyNullableToUndefined<
  RecursivelyRemoveKeys<
    Awaited<ReturnType<typeof client.queries.product>>["data"]["product"],
    `_${string}`
  >
>;
type CmsConfig = RecursivelyRemoveKeys<
  Awaited<ReturnType<typeof client.queries.config>>["data"]["config"],
  `_${string}`
>;

type AstroDeliveryMethod = InferEntrySchema<"deliveryMethod">;
type AstroMaterial = InferEntrySchema<"material">;
type AstroProduct = InferEntrySchema<"product">;
type AstroConfig = InferEntrySchema<"config">;

AssertTrue<IfEquals<CmsEnhancedDeliveryMethod, AstroDeliveryMethod>>();
AssertTrue<IfEquals<CmsEnhancedMaterial, AstroMaterial>>();

/**
 * Resolve every image reference in a loaded entity to its hashed local `src`.
 *
 * Tina image fields and rich-text `img` urls are stored as paths: a local
 * `/src/assets/...` path in `--local` builds, or an absolute Tina Cloud CDN URL
 * (`https://assets.tina.io/.../__file/<path>`) in cloud builds. Left untouched
 * the cloud form is serialized into a client island's props and hot-links to
 * Tina Cloud (see scripts/test/no-tina-cloud-urls.ts).
 *
 * Rather than enumerate every (easily-missed, deeply-nested) image field, we
 * walk the whole value and replace any string that looks like an image
 * reference with the optimized local `src` (`resolveImage` normalizes both
 * forms). Strings that don't resolve to a `src/assets` file are left as-is, so
 * the walk is safe to run over an entire entity.
 */
const IMAGE_REF = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;

/**
 * Flatten a Tina `*Connection` query result into a plain array of nodes,
 * dropping the nullable `edges` / `edge` / `node` wrappers Tina emits.
 */
function nodesFrom<TNode>(
  connection: { edges?: ({ node?: TNode | null } | null)[] | null } | null | undefined
): TNode[] {
  return connection?.edges?.flatMap((edge) => (edge?.node ? [edge.node] : [])) ?? [];
}

function resolveTinaImageRefs<T>(value: T): T {
  if (typeof value === "string") {
    if (IMAGE_REF.test(value)) {
      const resolved = resolveImage(value);
      if (resolved) {
        return resolved.src as T;
      }
    }
    return value;
  }
  if (Array.isArray(value)) {
    return (value as unknown[]).map((item) => resolveTinaImageRefs(item)) as T;
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(source)) {
      result[key] = resolveTinaImageRefs(val);
    }
    return result as T;
  }
  return value;
}

/**
 * Run a resolvable image reference through Astro's build-time image pipeline
 * (`getImage`) and return the optimized `src`.
 *
 * Plain `<img>` tags and client islands can't use `<Image>` / `getImage` at
 * runtime, so images that reach them (order-island color swatches, the
 * header/footer logos that are also serialized alongside the config) would
 * otherwise ship as the full-resolution original. `getImage` IS available here
 * — this module runs at build time inside the Astro server graph — so we
 * pre-optimize and hand the consumer a ready `src`. Falls back to the original
 * path when it can't resolve to a local asset (e.g. SVGs the pipeline passes
 * through, or unknown references).
 */
async function optimizeImage(path: string, width: number): Promise<string> {
  const meta = resolveImage(path);
  if (!meta) {
    return path;
  }
  const optimized = await getImage({ src: meta, width, format: "webp" });
  return optimized.src;
}

// Render widths (2x for retina) for images consumed outside `<Image>`.
const SWATCH_WIDTH = 200; // ~24px swatch (`size-6`) in the order island
const LOGO_WIDTH = 400; // ~100–200px header logo
const FOOTER_LOGO_WIDTH = 510; // ~255px footer logo

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const getConfig = async () => {
  const result = await requestWithMetadata(client.queries.config({ relativePath: "config.json" }));
  const { logo, footerLogo } = result.data.config;

  const data = resolveTinaImageRefs(result.data);
  // The header/footer render the logos with a plain `<img>` (and the config is
  // also serialized into the order island), so neither can go through
  // `<Image>`. Optimize them here at build time instead.
  if (logo) {
    data.config.logo = await optimizeImage(logo, LOGO_WIDTH);
  }
  if (footerLogo) {
    data.config.footerLogo = await optimizeImage(footerLogo, FOOTER_LOGO_WIDTH);
  }

  return { ...result, data };
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const getProducts = async () => {
  const result = await client.queries.productConnection();

  const products = nodesFrom(result.data.productConnection).toSorted((a, b) =>
    a.title.localeCompare(b.title)
  );

  // Optimize the color swatches before they're serialized into the order island.
  await Promise.all(
    products.flatMap(
      (product) =>
        product.materials?.materials?.flatMap((material) =>
          (material?.material_path.colors ?? []).map(async (color) => {
            if (color?.image) {
              color.image = await optimizeImage(color.image, SWATCH_WIDTH);
            }
          })
        ) ?? []
    )
  );

  return products.map((product) => resolveTinaImageRefs(product));
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const getMaterials = async () => {
  const result = await client.queries.product_materialsConnection();

  return nodesFrom(result.data.product_materialsConnection)
    .toSorted((a, b) => a.label.localeCompare(b.label))
    .map((material) => resolveTinaImageRefs(material));
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const getDeliveryMethods = async () => {
  const result = await client.queries.delivery_methodsConnection();

  return nodesFrom(result.data.delivery_methodsConnection);
};
