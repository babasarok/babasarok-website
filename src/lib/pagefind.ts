export type PagefindSection = "product" | "material" | "blog";

// Mirrors the browser search API types shipped by Pagefind 1.5.2:
// https://github.com/Pagefind/pagefind/blob/v1.5.2/pagefind_web_js/types/index.d.ts
// Playground-only verbose fields are omitted.

export interface PagefindIndexOptions {
  basePath?: string;
  baseUrl?: string;
  /** Max length of generated excerpts. Defaults to 30. */
  excerptLength?: number;
  /** Multiplier for all rankings of this index, for multisite setups. */
  indexWeight?: number;
  /** Merged into every search query of this index, for multisite setups. */
  mergeFilter?: Record<string, unknown>;
  /** Query parameter key that receives the search term, for Pagefind's highlighting script. */
  highlightParam?: string;
  language?: string;
  /** Whether this instance is the primary index in a multisite setup. Set automatically. */
  primary?: boolean;
  ranking?: PagefindRankingWeights;
  exactDiacritics?: boolean;
  /** Force searching on the main thread instead of a web worker. */
  noWorker?: boolean;
  /** Replaces the cache-busting timestamp on the metadata request, for service-worker caching. */
  metaCacheTag?: string;
}

export interface PagefindRankingWeights {
  /** Minimum 0.0; boost for words similar in length to the query terms. */
  termSimilarity?: number;
  /** 0.0–1.0; how much average page length affects ranking. */
  pageLength?: number;
  /** 0.0–2.0; how quickly terms saturate and lose ranking impact. */
  termSaturation?: number;
  /** 0.0–1.0; term frequency vs raw term count. */
  termFrequency?: number;
  /** Minimum 0.0; boost when query diacritics match the indexed word exactly. */
  diacriticSimilarity?: number;
  /** Boost per matching meta field, merged with the default { title: 5.0 }. */
  metaWeights?: Record<string, number>;
}

export interface PagefindSearchOptions {
  /** Loads all assets but returns before searching. Prefer `preload`. */
  preload?: boolean;
  verbose?: boolean;
  /** Filter set, extremely flexible; see Pagefind's filtering docs. */
  filters?: Record<string, unknown>;
  /** Sort set to use instead of relevancy. */
  sort?: Record<string, unknown>;
}

export type PagefindFilterCounts = Record<string, Record<string, number>>;

export interface PagefindTimings {
  preload: number;
  search: number;
  total: number;
}

export interface PagefindSearchResults {
  results: PagefindSearchResult[];
  /** Result count if the filters had been omitted. */
  unfilteredResultCount: number;
  /** Remaining results under each filter, given this query. */
  filters: PagefindFilterCounts;
  /** Total results for each filter if the searched filters were removed. */
  totalFilters: PagefindFilterCounts;
  timings: PagefindTimings;
}

export interface PagefindIndexesSearchResults extends Omit<PagefindSearchResults, "timings"> {
  timings: PagefindTimings[];
  search_environment?: string;
}

export interface PagefindSearchResult {
  /** Pagefind's internal id for this page, unique across the site. */
  id: string;
  /** Internal match score used for ranking. */
  score: number;
  /** Locations of all matching words in this page. */
  words: number[];
  /** Loads the data fragment for this result; only call when displaying it. */
  data: () => Promise<PagefindSearchFragment>;
}

export interface PagefindSearchFragment {
  /** Processed URL, including baseUrl when configured. */
  url: string;
  raw_url?: string;
  /** Full processed content text of the page. */
  content: string;
  raw_content?: string;
  /** Excerpt with matching terms wrapped in `<mark>` elements. */
  excerpt: string;
  /** Excerpt without `<mark>` elements. */
  plain_excerpt: string;
  /** Which regions of the page matched, precalculated from h1–h6 tags with ids. */
  sub_results: PagefindSubResult[];
  word_count: number;
  locations: number[];
  weighted_locations: PagefindWordLocation[];
  filters: Record<string, string[]>;
  /** Metadata tagged on the page; this site only sets `title` and `section`. */
  meta: {
    title?: string;
    section?: PagefindSection;
  };
  anchors: PagefindSearchAnchor[];
}

export interface PagefindSubResult {
  /** Heading-derived title; the page's meta.title before the first id-bearing heading. */
  title: string;
  /** The page URL plus the heading's hash; the page URL before the first id-bearing heading. */
  url: string;
  locations: number[];
  weighted_locations: PagefindWordLocation[];
  excerpt: string;
  plain_excerpt: string;
  /** Omitted when this sub result covers text before the first id-bearing heading. */
  anchor?: PagefindSearchAnchor;
}

export interface PagefindWordLocation {
  /** The weight this word was tagged as. */
  weight: number;
  /** Internal score, only meaningful relative to other values in the same result set. */
  balanced_score: number;
  /** Word index in the result content when split by whitespace. */
  location: number;
}

export interface PagefindSearchAnchor {
  /** Element type, e.g. `h1`, `div`. */
  element: string;
  id: string;
  text?: string;
  /** Word index after this element's id in the result content. */
  location: number;
}

export interface PagefindInstance {
  options: (opts: PagefindIndexOptions) => Promise<void>;
  init: () => Promise<void>;
  destroy: () => Promise<void>;
  mergeIndex: (indexPath: string, options: PagefindIndexOptions) => Promise<void>;
  search: (term: string, options?: PagefindSearchOptions) => Promise<PagefindIndexesSearchResults>;
  debouncedSearch: (
    term: string,
    options?: PagefindSearchOptions,
    debounceTimeoutMs?: number
  ) => Promise<PagefindIndexesSearchResults | null>;
  preload: (term: string, options?: PagefindSearchOptions) => Promise<void>;
  filters: () => Promise<PagefindFilterCounts>;
}

export interface PagefindApi {
  options: (opts: PagefindIndexOptions) => Promise<void>;
  init: () => Promise<void>;
  destroy: () => Promise<void>;
  mergeIndex: (indexPath: string, options: PagefindIndexOptions) => Promise<void>;
  search: (term: string, options?: PagefindSearchOptions) => Promise<PagefindSearchResults>;
  debouncedSearch: (
    term: string,
    options?: PagefindSearchOptions,
    debounceTimeoutMs?: number
  ) => Promise<PagefindSearchResults | null>;
  preload: (term: string, options?: PagefindSearchOptions) => Promise<void>;
  filters: () => Promise<PagefindFilterCounts>;
  createInstance: (options?: PagefindIndexOptions) => PagefindInstance;
}

let pagefind: Promise<PagefindApi> | undefined;

function load(): Promise<PagefindApi> {
  return (pagefind ??= import(
    /* @vite-ignore */ `${import.meta.env.BASE_URL}pagefind/pagefind.js`
  ) as Promise<PagefindApi>);
}

export function search(
  term: string,
  options?: PagefindSearchOptions
): Promise<PagefindSearchResults> {
  return load().then((api) => api.search(term, options));
}

export function setOptions(options: PagefindIndexOptions): Promise<void> {
  return load().then((api) => api.options(options));
}
