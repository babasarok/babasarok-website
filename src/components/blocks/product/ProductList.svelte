<script lang="ts">
  import { onMount } from "svelte";
  import type { i18n as I18n } from "i18next";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import type { Locale } from "@/lib/i18n";
  import type { SlimImage } from "@/lib/order/types";
  import type { ProductListItem } from "@/lib/catalog/listItems";
  import {
    applyListState,
    DEFAULT_LIST_STATE,
    parseListSort,
    parseListState,
    serializeListState,
    type ListProduct,
    type ProductListViewState,
  } from "../../../lib/product-list/query";
  import type { ProductType } from "../../../lib/product/productTypes";
  import FilterGroups from "./FilterGroups.svelte";
  import FilterSheet from "./FilterSheet.svelte";
  import ProductCard from "./ProductCard.svelte";

  interface SetOption {
    id: string;
    title: string;
  }

  interface ProductView extends ListProduct {
    href: string;
    category?: string | undefined;
    image?: SlimImage | undefined;
  }

  interface Props {
    locale: Locale;
    items: ProductListItem[];
    /** The catalogue's product sets, as filter options. */
    sets: SetOption[];
    /**
     * Item ids in popularity-rank order (the "Népszerű" sort). Items without
     * a rank follow the ranked ones.
     */
    popularOrder: string[];
  }

  let { locale, items, sets, popularOrder }: Props = $props();

  const products: ProductView[] = $derived(
    items.map((item) => ({
      id: item.id,
      title: item.title,
      shortDescription: item.shortDescription,
      type: item.type,
      date: item.date ? new Date(item.date) : undefined,
      sets: item.sets,
      href: item.href,
      category: item.category,
      image: item.image,
    }))
  );

  let view: ProductListViewState = $state({ ...DEFAULT_LIST_STATE });

  const visible = $derived(applyListState(products, view, popularOrder));

  function syncUrl(): void {
    const search = serializeListState(view);
    globalThis.history.replaceState(null, "", globalThis.location.pathname + search);
  }

  function setView(next: ProductListViewState): void {
    view = next;
    syncUrl();
  }

  function toggleType(value: ProductType): void {
    setView({
      ...view,
      types: view.types.includes(value)
        ? view.types.filter((t) => t !== value)
        : [...view.types, value],
    });
  }

  function toggleSet(id: string): void {
    setView({
      ...view,
      sets: view.sets.includes(id) ? view.sets.filter((s) => s !== id) : [...view.sets, id],
    });
  }

  function clearView(): void {
    setView({ ...DEFAULT_LIST_STATE });
  }

  function handleSortChange(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) {
      return;
    }
    setView({ ...view, sort: parseListSort(event.target.value) });
  }

  onMount(() => {
    view = parseListState(globalThis.location.search);
  });
</script>

{#snippet sortSelect(i18n: I18n, padding: "sm" | "lg")}
  <select
    data-pagefind-ignore
    value={view.sort}
    aria-label={i18n.t("filters.sort")}
    class={`text-body rounded-full border border-muted bg-light py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sand-300 ${
      padding === "sm" ? "shrink-0 px-3.5" : "px-5"
    }`}
    onchange={handleSortChange}
  >
    <option value="popular">{i18n.t("filters.popular")}</option>
    <option value="newest">{i18n.t("filters.newest")}</option>
    <option value="name">{i18n.t("filters.name")}</option>
  </select>
{/snippet}

<div class="flex flex-col gap-10 sm:flex-row sm:gap-12">
  <I18nGate {locale}>
    {#snippet children(i18n: I18n)}
      <aside class="hidden w-full shrink-0 sm:block sm:w-60">
        <label class="block">
          <span class="text-headings mb-2.5 block text-h5">{i18n.t("search.label")}</span>
          <input
            type="search"
            bind:value={view.q}
            oninput={() => setView(view)}
            placeholder={i18n.t("search.placeholder")}
            class="text-body w-full rounded-full border border-muted bg-light px-5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sand-300"
          />
        </label>
        <FilterGroups
          {i18n}
          {locale}
          {sets}
          selectedTypes={view.types}
          selectedSets={view.sets}
          onToggleType={toggleType}
          onToggleSet={toggleSet}
        />
      </aside>
    {/snippet}
  </I18nGate>
  <div class="min-w-0 flex-1">
    <I18nGate {locale}>
      {#snippet children(i18n: I18n)}
        <div class="mb-8 flex items-center gap-2 sm:hidden" data-pagefind-ignore>
          <input
            type="search"
            bind:value={view.q}
            oninput={() => setView(view)}
            placeholder={i18n.t("search.placeholder")}
            class="text-body min-w-0 flex-1 rounded-full border border-muted bg-light px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sand-300"
          />
          <FilterSheet
            {i18n}
            {locale}
            {sets}
            selectedTypes={view.types}
            selectedSets={view.sets}
            onToggleType={toggleType}
            onToggleSet={toggleSet}
            onClear={clearView}
          />
          {@render sortSelect(i18n, "sm")}
        </div>
        <div class="mb-8 hidden justify-end sm:flex">
          {@render sortSelect(i18n, "lg")}
        </div>
      {/snippet}
    </I18nGate>
    <div
      class="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-8 gap-y-12 px-4 sm:gap-y-8 sm:px-0"
    >
      {#each visible as product (product.id)}
        <ProductCard
          href={product.href}
          title={product.title}
          category={product.category}
          image={product.image}
        />
      {/each}
    </div>
    {#if visible.length === 0}
      <I18nGate {locale}>
        {#snippet children(i18n: I18n)}
          <div class="text-body py-20 text-center">
            <p class="text-headings mb-5 text-h4">{i18n.t("filters.noResults")}</p>
            <button
              type="button"
              onclick={clearView}
              class="rounded-full bg-accent px-6 py-2.5 text-sm text-light transition-colors hover:bg-sand-700"
            >
              {i18n.t("filters.clear")}
            </button>
          </div>
        {/snippet}
      </I18nGate>
    {/if}
  </div>
</div>
