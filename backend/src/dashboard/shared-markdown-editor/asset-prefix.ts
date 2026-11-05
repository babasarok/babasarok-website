import { api } from "@vendure/dashboard";
import { graphql } from "@/gql";
import { assetPrefixOf, toDisplaySrc, toStoredSrc, type AssetPaths } from "./markdown-assets";

const anyAssetQuery = graphql(`
  query MarkdownEditorAnyAsset {
    assets(options: { take: 1 }) {
      items {
        source
      }
    }
  }
`);

let prefix: string | undefined;

export async function loadAssetPrefix(): Promise<void> {
  if (prefix) {
    return;
  }

  const result = await api.query(anyAssetQuery);
  const source = result.assets.items[0]?.source;
  prefix = (source ? assetPrefixOf(source) : null) ?? undefined;
}

export const assetPaths: AssetPaths = {
  toDisplaySrc: (href) => toDisplaySrc(href, prefix),
  toStoredSrc: (src) => {
    prefix ??= assetPrefixOf(src) ?? undefined;
    return toStoredSrc(src, prefix);
  },
};
