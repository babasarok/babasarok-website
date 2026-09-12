<script lang="ts">
import { onMount, type Snippet } from "svelte";
import {
  applyListState,
  DEFAULT_LIST_STATE,
  parseListState,
  serializeListState,
  type ListProduct,
  type ProductListViewState,
} from "../../../lib/product-list/query";
import { PRODUCT_TYPES, type ProductType } from "../../../lib/product/productTypes";

interface SetOption {
  id: string;
  title: string;
}

interface Props {
  children?: Snippet;
  /**
   * Minimal list data; `date` is an ISO string (island props are JSON-
   * serialized). `id` is the product's content entry id (matching each
   * card's `data-product-id`), not the CMS `product_id`.
   */
  items: {
    id: string;
    title: string;
    shortDescription?: string | undefined;
    type: ProductType;
    date?: string | undefined;
    sets?: string[];
  }[];
  /** The catalogue's product sets, as filter options. */
  sets: SetOption[];
}

let { items, sets, children }: Props = $props();

const products: ListProduct[] = $derived(
  items.map((item) => ({
    id: item.id,
    title: item.title,
    shortDescription: item.shortDescription,
    type: item.type,
    date: item.date ? new Date(item.date) : undefined,
    sets: item.sets ?? [],
  }))
);

let view: ProductListViewState = $state({ ...DEFAULT_LIST_STATE });
let gridEl: HTMLDivElement | undefined = $state();
let empty = $state(false);
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- static server-rendered cards, never re-created
const cards = new Map<string, HTMLElement>();

function applyView(): void {
  if (!gridEl) {
    return;
  }
  const visible = applyListState(products, view);
  const visibleIds = new Set(visible.map((p) => p.id));
  for (const [id, card] of cards) {
    card.style.display = visibleIds.has(id) ? "" : "none";
  }
  for (const product of visible) {
    const card = cards.get(product.id);
    if (card) {
      // eslint-disable-next-line svelte/no-dom-manipulating -- reorders the server-rendered grid
      gridEl.append(card);
    }
  }
  empty = visible.length === 0;
}

function syncUrl(): void {
  const search = serializeListState(view);
  globalThis.history.replaceState(null, "", globalThis.location.pathname + search);
}

function setView(next: ProductListViewState): void {
  view = next;
  applyView();
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

onMount(() => {
  for (const card of gridEl?.querySelectorAll<HTMLElement>("[data-product-id]") ?? []) {
    const id = card.dataset.productId;
    if (id) {
      cards.set(id, card);
    }
  }
  view = parseListState(globalThis.location.search);
  applyView();
});
</script>

<div class="flex flex-col gap-10 lg:flex-row lg:gap-12">
  <aside class="w-full shrink-0 lg:w-60">
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
    <fieldset class="mt-8">
      <legend class="text-headings mb-2.5 text-h5">Terméktípus</legend>
      <div class="flex flex-col gap-1.5">
        {#each PRODUCT_TYPES as type (type.value)}
          <label class="text-body flex cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              value={type.value}
              checked={view.types.includes(type.value)}
              onchange={() => toggleType(type.value)}
              class="size-4 accent-accent"
            />
            {type.label}
          </label>
        {/each}
      </div>
    </fieldset>
    <fieldset class="mt-8">
      <legend class="text-headings mb-2.5 text-h5">Szettek</legend>
      <div class="flex flex-col gap-1.5">
        {#each sets as set (set.id)}
          <label class="text-body flex cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              value={set.id}
              checked={view.sets.includes(set.id)}
              onchange={() => toggleSet(set.id)}
              class="size-4 accent-accent"
            />
            {set.title}
          </label>
        {/each}
      </div>
    </fieldset>
  </aside>
  <div class="min-w-0 flex-1">
    <div class="mb-8 flex justify-end">
      <select
        value={view.sort}
        aria-label="Rendezés"
        class="text-body rounded-full border border-muted bg-light px-5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sand-300"
        onchange={(event) => {
          if (!(event.target instanceof HTMLSelectElement)) {
            return;
          }
          setView({ ...view, sort: event.target.value === "name" ? "name" : "newest" });
        }}
      >
        <option value="newest">Legfrissebb</option>
        <option value="name">Név szerint</option>
      </select>
    </div>
    <div
      bind:this={gridEl}
      class="flex flex-wrap justify-center gap-8 gap-y-12 sm:gap-y-8"
    >
      {@render children?.()}
    </div>
    {#if empty}
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
