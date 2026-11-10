<script lang="ts">
  import { remoteValue } from "@/lib/catalog/remote.svelte";
  import type { Catalog } from "@/lib/catalog";
  import { catalogStore } from "@/lib/catalog/store";
  import type { Locale } from "@/lib/i18n";
  import CatalogState from "./CatalogState.svelte";

  interface Props {
    locale: Locale;
  }

  let { locale }: Props = $props();

  const catalog = remoteValue(() => catalogStore.catalog(locale));
</script>

<CatalogState {locale} remote={catalog.current} retry={catalog.retry}>
  {#snippet skeleton()}
    <ul class="animate-pulse">
      {#each { length: 6 }, index (index)}
        <li><div class="bg-brown-100 h-5 w-48 rounded-md"></div></li>
      {/each}
    </ul>
  {/snippet}

  {#snippet children(loaded: Catalog)}
    {@const products = loaded.products.toSorted((a, b) => a.name.localeCompare(b.name, locale))}
    <ul>
      {#each products as product (product.slug)}
        <li>{product.name.trim()}</li>
      {/each}
    </ul>
  {/snippet}
</CatalogState>
