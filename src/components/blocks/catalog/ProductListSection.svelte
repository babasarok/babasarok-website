<script lang="ts">
  import ProductList from "@/components/blocks/product/ProductList.svelte";
  import ProductListSkeleton from "@/components/blocks/product/ProductListSkeleton.svelte";
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
    <ProductListSkeleton />
  {/snippet}

  {#snippet children(loaded: Catalog)}
    {@const list = toProductListData(loaded.products, loaded.groups, ASSET_BASE, locale)}
    <ProductList {locale} items={list.items} sets={list.sets} popularOrder={list.popularOrder} />
  {/snippet}
</CatalogState>
