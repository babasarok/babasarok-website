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
import { requestWithMetadata } from "@tinacms/astro/data";
import client from "../../tina/__generated__/client";

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const getConfig = () =>
  requestWithMetadata(client.queries.config({ relativePath: "config.json" }));

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const getProducts = async () => {
  const result = await client.queries.productConnection();

  const products = result.data.productConnection.edges?.flatMap((edge) =>
    edge?.node ? [edge.node] : []
  );

  return products?.toSorted((a, b) => a.title.localeCompare(b.title)) ?? [];
};

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const getMaterials = async () => {
  const result = await client.queries.product_materialsConnection();

  const materials = result.data.product_materialsConnection.edges?.flatMap((edge) =>
    edge?.node ? [edge.node] : []
  );

  return materials?.toSorted((a, b) => a.label.localeCompare(b.label)) ?? [];
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
