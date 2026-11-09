<script lang="ts">
  import ProductList from "@/components/blocks/product/ProductList.svelte";
  import { toProductListData } from "@/lib/catalog/listItems";
  import { remoteValue } from "@/lib/catalog/remote.svelte";
  import type { Catalog } from "@/lib/catalog";
  import { catalogStore } from "@/lib/catalog/store";
  import type { Locale } from "@/lib/i18n";
  import { ASSET_BASE } from "@/lib/vendure/client";
  import CatalogState from "./CatalogState.svelte";

  interface Props {
    locale: Locale;
  }

  let { locale }: Props = $props();

  const catalog = remoteValue(() => catalogStore.catalog(locale));
</script>

<CatalogState {locale} remote={catalog.current} retry={catalog.retry}>
  {#snippet skeleton()}
    <div class="grid animate-pulse grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
      {#each { length: 8 }, index (index)}
        <div class="flex flex-col gap-3">
          <div class="bg-brown-100 aspect-square rounded-[20px]"></div>
          <div class="bg-brown-100 h-4 w-1/2 rounded-md"></div>
          <div class="bg-brown-100 h-5 w-3/4 rounded-md"></div>
        </div>
      {/each}
    </div>
  {/snippet}

  {#snippet children(loaded: Catalog)}
    {@const list = toProductListData(loaded.products, loaded.groups, ASSET_BASE, locale)}
    <ProductList {locale} items={list.items} sets={list.sets} popularOrder={list.popularOrder} />
  {/snippet}
</CatalogState>
