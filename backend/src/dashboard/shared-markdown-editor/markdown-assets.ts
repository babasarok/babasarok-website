const ASSET_PATH = /^source\/[^/]{2}\/[^/]+$/;
const ASSET_PATH_TAIL = /source\/[^/]{2}\/[^/]+$/;

export interface AssetPaths {
  toDisplaySrc: (href: string) => string;
  toStoredSrc: (src: string) => string;
}

export function assetPrefixOf(url: string): string | null {
  const match = ASSET_PATH_TAIL.exec(url);

  if (!match) {
    return null;
  }

  return url.slice(0, match.index);
}

export function toStoredSrc(src: string, prefix?: string): string {
  if (!prefix || !src.startsWith(prefix)) {
    return src;
  }

  const path = src.slice(prefix.length);
  return ASSET_PATH.test(path) ? path : src;
}

export function toDisplaySrc(href: string, prefix?: string): string {
  if (!prefix || !ASSET_PATH.test(href)) {
    return href;
  }

  return `${prefix}${href}`;
}

export function isBlankMarkdown(markdown: string): boolean {
  return markdown.trim() === "";
}
