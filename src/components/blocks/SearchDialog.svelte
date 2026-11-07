<script lang="ts">
  import Icon from "@iconify/svelte";
  import Dialog from "@/components/ui/Dialog.svelte";
  import { localeFromPathname, localizedPath } from "@/lib/i18n";
  import { search, setOptions, type PagefindSection } from "@/lib/pagefind";
  import type { i18n as I18n } from "i18next";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import type { Locale } from "@/lib/i18n";
  import { onMount } from "svelte";
  import {
    CatalogSearchIndexSchema,
    matchCatalogEntries,
    type CatalogSearchEntry,
  } from "@/lib/catalog/searchIndex";

  interface Props {
    locale: Locale;
  }

  let { locale }: Props = $props();

  interface Hit {
    url: string;
    title: string;
    section: PagefindSection | undefined;
    excerptHtml: string | undefined;
    excerptText: string | undefined;
  }

  const SECTION_ORDER: Record<string, number> = { product: 0, material: 1 };

  onMount(() => {
    void setOptions({ excerptLength: 10 });
  });

  let callSeq = 0;
  let catalogIndex: Promise<CatalogSearchEntry[]> | undefined;

  let query = $state("");
  let searching = $state(false);
  let failed = $state(false);
  let results = $state<Hit[]>([]);

  function loadCatalogIndex(): Promise<CatalogSearchEntry[]> {
    catalogIndex ??= fetch(
      localizedPath("/search-index.json", localeFromPathname(globalThis.location.pathname))
    )
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Search index HTTP ${response.status}`);
        }

        return response.json();
      })
      .then((json) => CatalogSearchIndexSchema.parse(json))
      .catch((error: unknown) => {
        catalogIndex = undefined;
        throw error;
      });

    return catalogIndex;
  }

  async function searchPagefind(term: string): Promise<Hit[]> {
    const response = await search(term);
    const found = await Promise.all(response.results.map((result) => result.data()));

    return found.map((fragment) => ({
      url: fragment.url,
      title: fragment.meta.title ?? fragment.url,
      section: fragment.meta.section,
      excerptHtml: fragment.excerpt,
      excerptText: undefined,
    }));
  }

  async function searchCatalog(term: string): Promise<Hit[]> {
    return matchCatalogEntries(await loadCatalogIndex(), term).map((entry) => ({
      url: entry.url,
      title: entry.title,
      section: entry.section,
      excerptHtml: undefined,
      excerptText: entry.excerpt,
    }));
  }

  function path(url: string): string {
    return url.replace(/\/$/, "");
  }

  function merge(catalog: Hit[], pages: Hit[]): Hit[] {
    const catalogPaths = new Set(catalog.map((hit) => path(hit.url)));
    const merged = [...catalog, ...pages.filter((hit) => !catalogPaths.has(path(hit.url)))];

    return merged.toSorted(
      (a, b) => (SECTION_ORDER[a.section ?? ""] ?? 2) - (SECTION_ORDER[b.section ?? ""] ?? 2)
    );
  }

  async function onInput(event: Event): Promise<void> {
    query = (event.target as HTMLInputElement).value;
    const term = query.trim();
    const seq = ++callSeq;

    if (!term) {
      results = [];
      failed = false;
      searching = false;
      return;
    }

    searching = true;

    const [catalog, pages] = await Promise.allSettled([searchCatalog(term), searchPagefind(term)]);

    if (seq !== callSeq) {
      return;
    }

    failed = catalog.status === "rejected" && pages.status === "rejected";
    results = merge(
      catalog.status === "fulfilled" ? catalog.value : [],
      pages.status === "fulfilled" ? pages.value : []
    );
    searching = false;
  }

  const SEARCH_SECTION_KEYS = {
    product: "search.product",
    material: "search.material",
    blog: "search.blog",
  } as const satisfies Record<PagefindSection, string>;

  function sectionName(i18n: I18n, section: PagefindSection): string {
    return i18n.t(SEARCH_SECTION_KEYS[section]);
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && results[0]) {
      globalThis.location.assign(results[0].url);
    }
  }
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    <Dialog
      aria-label={i18n.t("search.open")}
      onClose={() => {
        searching = false;
        failed = false;
        query = "";
        results = [];
      }}
    >
      {#snippet button(id)}
        <button
          type="button"
          commandfor={id}
          command="show-modal"
          aria-label={i18n.t("search.open")}
          class="flex cursor-pointer items-center gap-1 p-2 text-dark transition-colors hover:text-sand-300"
        >
          <Icon icon="mdi:magnify" class="text-2xl" />
        </button>
      {/snippet}
      {#snippet content(close)}
        <div class="flex items-center gap-2">
          <input
            type="search"
            aria-label={i18n.t("search.open")}
            placeholder={i18n.t("search.placeholder")}
            value={query}
            oninput={(event) => void onInput(event)}
            onkeydown={onKeydown}
            class="w-full rounded-lg border border-brown-200 px-4 py-2.5 text-dark outline-none focus:border-accent"
          />
          <button
            type="button"
            onclick={close}
            aria-label={i18n.t("common.close")}
            class="flex shrink-0 cursor-pointer rounded-full p-1.5 text-brown-500 transition-colors hover:bg-brown-100 hover:text-dark"
          >
            <Icon icon="mdi:close" class="text-2xl" />
          </button>
        </div>
        {#if query.trim()}
          <p class="mt-3 text-sm text-brown-500" aria-live="polite">
            {#if searching}
              {i18n.t("search.placeholder")}
            {:else if failed}
              {i18n.t("search.unavailable")}
            {:else}
              {i18n.t("search.results", { count: results.length })}
            {/if}
          </p>
          <ul class="mt-2 flex max-h-[60dvh] flex-col gap-1 overflow-y-auto">
            {#each results as result (result.url)}
              <li>
                <a
                  href={result.url}
                  class="flex flex-col rounded-lg p-3 transition-colors hover:bg-sand-50"
                >
                  <span
                    class="font-medium text-dark whitespace-nowrap text-ellipsis overflow-hidden"
                    >{result.title}</span
                  >
                  {#if result.section}
                    <span class="shrink-0 text-xs text-brown-500"
                      >{sectionName(i18n, result.section)}</span
                    >
                  {/if}
                  {#if result.excerptText}
                    <span class="mt-1 block text-sm text-body">{result.excerptText}</span>
                  {:else if result.excerptHtml}
                    <span
                      class="mt-1 block text-sm text-body [&_mark]:bg-sand-100 [&_mark]:text-inherit"
                    >
                      <!-- eslint-disable-next-line svelte/no-at-html-tags - Pagefind's excerpts are entity-encoded, only <mark> is injected -->
                      {@html result.excerptHtml}
                    </span>
                  {/if}
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      {/snippet}
    </Dialog>
  {/snippet}
</I18nGate>
