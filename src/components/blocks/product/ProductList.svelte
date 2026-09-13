<script lang="ts">
  import { onMount } from "svelte";
  import type { SlimImage } from "@/lib/data";
  import {
    applyListState,
    DEFAULT_LIST_STATE,
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

  /**
   * A list item as handed over the island boundary. `date` is an ISO string
   * (island props are JSON-serialized); `id` is the product's content entry id.
   */
  interface ListItem extends Omit<ListProduct, "date"> {
    date?: string | undefined;
    href: string;
    category?: string | undefined;
    image?: SlimImage | undefined;
  }

  interface ProductView extends ListProduct {
    href: string;
    category?: string | undefined;
    image?: SlimImage | undefined;
  }

  interface Props {
    items: ListItem[];
    /** The catalogue's product sets, as filter options. */
    sets: SetOption[];
  }

  let { items, sets }: Props = $props();

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

  const visible = $derived(applyListState(products, view));

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
    setView({ ...view, sort: event.target.value === "name" ? "name" : "newest" });
  }

  onMount(() => {
    view = parseListState(globalThis.location.search);
  });
</script>

{#snippet sortSelect(padding: "sm" | "lg")}
  <select
    value={view.sort}
    aria-label="Rendezés"
    class={`text-body rounded-full border border-muted bg-light py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sand-300 ${
      padding === "sm" ? "shrink-0 px-3.5" : "px-5"
    }`}
    onchange={handleSortChange}
  >
    <option value="newest">Legfrissebb</option>
    <option value="name">Név szerint</option>
  </select>
{/snippet}

<div class="flex flex-col gap-10 sm:flex-row sm:gap-12">
  <aside class="hidden w-full shrink-0 sm:block sm:w-60">
    <label class="block">
      <span class="text-headings mb-2.5 block text-h5">Keresés</span>
      <input
        type="search"
        bind:value={view.q}
        oninput={() => setView(view)}
        placeholder="Keresés"
        class="text-body w-full rounded-full border border-muted bg-light px-5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sand-300"
      />
    </label>
    <FilterGroups
      {sets}
      selectedTypes={view.types}
      selectedSets={view.sets}
      onToggleType={toggleType}
      onToggleSet={toggleSet}
    />
  </aside>
  <div class="min-w-0 flex-1">
    <div class="mb-8 flex items-center gap-2 sm:hidden">
      <input
        type="search"
        bind:value={view.q}
        oninput={() => setView(view)}
        placeholder="Keresés"
        class="text-body min-w-0 flex-1 rounded-full border border-muted bg-light px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sand-300"
      />
      <FilterSheet
        {sets}
        selectedTypes={view.types}
        selectedSets={view.sets}
        onToggleType={toggleType}
        onToggleSet={toggleSet}
        onClear={clearView}
      />
      {@render sortSelect("sm")}
    </div>
    <div class="mb-8 hidden justify-end sm:flex">
      {@render sortSelect("lg")}
    </div>
    <div class="flex flex-wrap gap-8 gap-y-12 px-4 sm:gap-y-8 sm:px-0">
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
      <div class="text-body py-20 text-center">
        <p class="text-headings mb-5 text-h4">Nincs találat</p>
        <button
          type="button"
          onclick={clearView}
          class="rounded-full bg-accent px-6 py-2.5 text-sm text-light transition-colors hover:bg-sand-700"
        >
          Szűrők törlése
        </button>
      </div>
    {/if}
  </div>
</div>
