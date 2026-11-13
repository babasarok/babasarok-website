<script lang="ts">
  import type { i18n as I18n } from "i18next";
  import CatalogCard from "@/components/ui/CatalogCard.svelte";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import type { Catalog } from "@/lib/catalog";
  import { sortedMaterials } from "@/lib/catalog/materialPage";
  import { remoteValue } from "@/lib/catalog/remote.svelte";
  import { catalogStore } from "@/lib/catalog/store";
  import { localizedPath, type Locale } from "@/lib/i18n";
  import CatalogState from "./CatalogState.svelte";

  interface Props {
    locale: Locale;
  }

  let { locale }: Props = $props();

  const catalog = remoteValue(() => catalogStore.catalog(locale));
</script>

<CatalogState {locale} remote={catalog.current} retry={catalog.retry}>
  {#snippet skeleton()}
    <div class="flex animate-pulse flex-wrap justify-center gap-8 gap-y-12 sm:gap-y-8">
      {#each { length: 6 }, index (index)}
        <div class="flex w-full max-w-62.5 flex-col items-center lg:w-1/2 lg:p-7.5">
          <div
            class="bg-brown-100 aspect-square w-full max-w-[50vw] rounded-[20px] sm:max-w-75"
          ></div>
          <div class="bg-brown-100 mt-7 h-4 w-40 rounded-md"></div>
          <div class="bg-brown-100 mt-2.5 h-3.5 w-28 rounded-md"></div>
        </div>
      {/each}
    </div>
  {/snippet}

  {#snippet children(value: Catalog)}
    {@const materials = sortedMaterials(value.materials, locale)}
    <I18nGate {locale}>
      {#snippet children(i18n: I18n)}
        <div class="flex flex-wrap justify-center gap-8 gap-y-12 sm:gap-y-8">
          {#each materials as material (material.slug)}
            <CatalogCard
              href={localizedPath(`/material/${material.slug}/`, locale)}
              title={material.label}
              image={material.thumbnail ?? undefined}
              category={material.subtitle || undefined}
              detailsLabel={i18n.t("common.details")}
            />
          {/each}
        </div>
      {/snippet}
    </I18nGate>
  {/snippet}
</CatalogState>
