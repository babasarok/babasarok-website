import { atom, type ReadableAtom, type WritableAtom } from "nanostores";
import { errorDetails, reportClientError } from "@/lib/errorReport";
import { VENDURE_LANGUAGE_CODE, type Locale } from "@/lib/i18n";
import { getCatalog, getProduct, type Catalog } from "./index";
import type { CatalogProductDetail } from "./mappers";

export type Remote<T> =
  { status: "loading" } | { status: "failed" } | { status: "ready"; value: T };

export interface CatalogStoreDeps {
  loadCatalog: (locale: Locale) => Promise<Catalog>;
  loadProduct: (locale: Locale, slug: string) => Promise<CatalogProductDetail | null>;
  now: () => number;
  onError: (error: unknown) => void;
}

export interface CatalogStore {
  /** The shared catalog for a page language; accessing it refreshes stale or failed data. */
  catalog: (locale: Locale) => ReadableAtom<Remote<Catalog>>;
  /** A product's detail; null once loaded means no storefront product has that slug. */
  product: (locale: Locale, slug: string) => ReadableAtom<Remote<CatalogProductDetail | null>>;
}

/** How long loaded data is shown without a background refresh (the former edge-cache TTL). */
export const CATALOG_MAX_AGE_MS = 60_000;

function createResource<T>(
  load: () => Promise<T>,
  deps: Pick<CatalogStoreDeps, "now" | "onError">
): () => ReadableAtom<Remote<T>> {
  const store: WritableAtom<Remote<T>> = atom<Remote<T>>({ status: "loading" });
  let loadedAt: number | null = null;
  let pending = false;

  function refresh(): void {
    if (pending) {
      return;
    }

    pending = true;
    load()
      .then((value) => {
        loadedAt = deps.now();
        store.set({ status: "ready", value });
      })
      .catch((error: unknown) => {
        deps.onError(error);

        if (store.get().status !== "ready") {
          store.set({ status: "failed" });
        }
      })
      .finally(() => {
        pending = false;
      });
  }

  return () => {
    if (store.get().status === "failed") {
      store.set({ status: "loading" });
      refresh();

      return store;
    }

    if (loadedAt === null || deps.now() - loadedAt >= CATALOG_MAX_AGE_MS) {
      refresh();
    }

    return store;
  };
}

function memoized<Key, Value>(create: (key: Key) => Value): (key: Key) => Value {
  const cache = new Map<Key, Value>();

  return (key) => {
    const cached = cache.get(key);

    if (cached !== undefined) {
      return cached;
    }

    const created = create(key);
    cache.set(key, created);

    return created;
  };
}

export function createCatalogStore(deps: CatalogStoreDeps): CatalogStore {
  const catalogs = memoized((locale: Locale) =>
    createResource(() => deps.loadCatalog(locale), deps)
  );
  const products = memoized((locale: Locale) =>
    memoized((slug: string) => createResource(() => deps.loadProduct(locale, slug), deps))
  );

  return {
    catalog: (locale) => catalogs(locale)(),
    product: (locale, slug) => products(locale)(slug)(),
  };
}

/** Ready only when both are; failed as soon as either fails. */
export function bothReady<A, B>(a: Remote<A>, b: Remote<B>): Remote<[A, B]> {
  if (a.status === "failed" || b.status === "failed") {
    return { status: "failed" };
  }

  if (a.status === "loading" || b.status === "loading") {
    return { status: "loading" };
  }

  return { status: "ready", value: [a.value, b.value] };
}

export const catalogStore = createCatalogStore({
  loadCatalog: (locale) => getCatalog(undefined, VENDURE_LANGUAGE_CODE[locale]),
  loadProduct: (locale, slug) => getProduct(slug, undefined, VENDURE_LANGUAGE_CODE[locale]),
  now: () => Date.now(),
  onError: (error) => {
    reportClientError({ kind: "uncaught", ...errorDetails(error) });
  },
});
