const ASSET_REF_PREFIX = "asset:";
const IMAGE_ASSET_REF = /!\[[^\]]*\]\(asset:([^\s)]+)/g;

export function assetRef(assetId: string): string {
  return `${ASSET_REF_PREFIX}${assetId}`;
}

export function parseAssetRef(href: string): string | null {
  if (!href.startsWith(ASSET_REF_PREFIX)) {
    return null;
  }

  return href.slice(ASSET_REF_PREFIX.length) || null;
}

export function assetIdsIn(markdown: string): string[] {
  return [...new Set([...markdown.matchAll(IMAGE_ASSET_REF)].map((match) => match[1]))];
}

export function isBlankMarkdown(markdown: string): boolean {
  return markdown.trim() === "";
}
