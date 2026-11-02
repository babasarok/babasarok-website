import { api } from "@vendure/dashboard";
import { graphql } from "@/gql";

const assetsByIdQuery = graphql(`
  query MarkdownEditorAssetsById($ids: [String!]!) {
    assets(options: { filter: { id: { in: $ids } } }) {
      items {
        id
        source
      }
    }
  }
`);

const assetBySourceQuery = graphql(`
  query MarkdownEditorAssetBySource($source: String!) {
    assets(options: { filter: { source: { eq: $source } }, take: 1 }) {
      items {
        id
        source
      }
    }
  }
`);

const urlById = new Map<string, string>();
const idByUrl = new Map<string, string>();

function remember(asset: { id: string; source: string }): void {
  urlById.set(asset.id, asset.source);
  idByUrl.set(asset.source, asset.id);
}

export function displayUrlOf(assetId: string): string | undefined {
  return urlById.get(assetId);
}

export async function loadAssetUrls(assetIds: string[]): Promise<void> {
  const missing = assetIds.filter((id) => !urlById.has(id));

  if (missing.length === 0) {
    return;
  }

  const result = await api.query(assetsByIdQuery, { ids: missing });
  for (const asset of result.assets.items) {
    remember(asset);
  }
}

export async function assetIdOfUrl(url: string): Promise<string | undefined> {
  const known = idByUrl.get(url);

  if (known) {
    return known;
  }

  const result = await api.query(assetBySourceQuery, { source: url });
  for (const asset of result.assets.items) {
    remember(asset);
  }
  return idByUrl.get(url);
}
