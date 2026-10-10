export interface PagefindDocument {
  url: string;
  excerpt: string;
  meta: {
    title?: string;
  };
}

export interface PagefindResult {
  data: () => Promise<PagefindDocument>;
}

export interface PagefindResponse {
  results: PagefindResult[];
}

export interface PagefindApi {
  search: (term: string) => Promise<PagefindResponse>;
}

let pagefind: Promise<PagefindApi> | undefined;

export function search(term: string): Promise<PagefindResponse> {
  pagefind ??= import(
    /* @vite-ignore */ `${import.meta.env.BASE_URL}pagefind/pagefind.js`
  ) as Promise<PagefindApi>;
  return pagefind.then((api) => api.search(term));
}
