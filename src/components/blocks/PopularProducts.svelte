<script lang="ts">
  import type { i18n as I18n } from "i18next";
  import CatalogState from "@/components/blocks/catalog/CatalogState.svelte";
  import CatalogCard from "@/components/ui/CatalogCard.svelte";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import { listedByPopularity } from "@/lib/catalog/listItems";
  import { remoteValue } from "@/lib/catalog/remote.svelte";
  import type { Catalog } from "@/lib/catalog";
  import { catalogStore } from "@/lib/catalog/store";
  import { localizedPath, type Locale } from "@/lib/i18n";

  interface Props {
    locale: Locale;
    itemCount: number;
  }

  let { locale, itemCount }: Props = $props();

  const catalog = remoteValue(() => catalogStore.catalog(locale));
</script>

<CatalogState {locale} remote={catalog.current} retry={catalog.retry}>
  {#snippet skeleton()}
    <div class="min-h-96"></div>
  {/snippet}

  {#snippet children(loaded: Catalog)}
    <I18nGate {locale}>
      {#snippet children(i18n: I18n)}
        <div class="flex flex-wrap justify-center gap-8 gap-y-12 sm:gap-y-8">
          {#each listedByPopularity(loaded.products).slice(0, itemCount) as product (product.id)}
            <CatalogCard
              href={localizedPath(`/product/${product.slug}/`, locale)}
              title={product.name}
              image={product.thumbnailUrl ?? undefined}
              category={product.tagline ?? undefined}
              detailsLabel={i18n.t("common.details")}
              square
            />
          {/each}
        </div>
      {/snippet}
    </I18nGate>
  {/snippet}
</CatalogState>
