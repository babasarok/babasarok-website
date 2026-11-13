<script lang="ts">
  import Icon from "@iconify/svelte";
  import type { i18n as I18n } from "i18next";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import Markdown from "@/components/ui/Markdown.svelte";
  import VendureImage from "@/components/ui/VendureImage.svelte";
  import type { Catalog } from "@/lib/catalog";
  import { toMaterialPageData } from "@/lib/catalog/materialPage";
  import { remoteValue } from "@/lib/catalog/remote.svelte";
  import { catalogStore } from "@/lib/catalog/store";
  import type { Locale } from "@/lib/i18n";
  import CatalogState from "./CatalogState.svelte";
  import DetailNav from "./DetailNav.svelte";

  interface Props {
    locale: Locale;
    slug: string;
    shareUrl: string;
  }

  let { locale, slug, shareUrl }: Props = $props();

  const catalog = remoteValue(() => catalogStore.catalog(locale));

  $effect(() => {
    if (catalog.current.status !== "ready") {
      return;
    }

    const { material } = toMaterialPageData(catalog.current.value.materials, slug, locale);

    if (material === undefined) {
      return;
    }

    document.title = material.label;
  });
</script>

<CatalogState {locale} remote={catalog.current} retry={catalog.retry}>
  {#snippet skeleton()}
    <div class="flex animate-pulse flex-col items-center">
      <div class="bg-brown-100 mb-6 h-10 w-64 rounded-md sm:w-80"></div>
      <div class="bg-brown-100 mt-7.5 mb-12 aspect-2/1 w-full max-w-250 rounded-[20px]"></div>
      <div class="bg-brown-100 mb-3 h-5 w-3/4 rounded-md"></div>
      <div class="bg-brown-100 mb-3 h-5 w-full max-w-2xl rounded-md"></div>
      <div class="bg-brown-100 h-5 w-1/2 rounded-md"></div>
    </div>
  {/snippet}

  {#snippet children(loaded: Catalog)}
    {@const { material, previous, next } = toMaterialPageData(loaded.materials, slug, locale)}
    <I18nGate {locale}>
      {#snippet children(i18n: I18n)}
        {#if material === undefined}
          <p class="py-12 text-center">{i18n.t("catalog.materialNotFound")}</p>
        {:else}
          <div class="relative z-1 mb-12 text-center lg:mx-auto lg:w-10/12">
            <h1 class="text-h1 text-headings mb-6">{material.label}</h1>
            {#if material.subtitle}
              <p>{material.subtitle}</p>
            {/if}

            {#if material.thumbnail}
              <div class="mt-7.5 mb-12 flex flex-col items-center">
                <div class="overflow-hidden rounded-[20px]">
                  <VendureImage
                    asset={material.thumbnail}
                    alt={material.label}
                    presets={["hero-sm", "hero-md", "hero-lg"]}
                    sizes="(min-width: 768px) 1000px, 100vw"
                    class="w-full object-cover lg:max-w-1000"
                  />
                </div>
              </div>
            {/if}

            {#if material.colors.length > 0}
              <div class="mb-12.5">
                <h2 class="text-h2 text-headings mb-7.5">{i18n.t("pages.colors")}</h2>
                <div
                  class="mb-4 flex items-center rounded-lg border border-yellow-400 bg-yellow-100 p-4 text-sm text-yellow-800"
                >
                  <Icon icon="mdi:alert-circle-outline" class="mr-2 inline-block shrink-0" />
                  {i18n.t("pages.colorsNotice")}
                </div>
                <div class="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] items-start gap-5">
                  {#each material.colors as color (color.id)}
                    <div class="flex flex-col items-center">
                      {#if color.image}
                        <VendureImage
                          asset={color.image}
                          alt={color.label}
                          presets={["card-sm"]}
                          width={150}
                          height={150}
                          class="size-37.5 rounded-[25%] object-cover"
                        />
                      {:else}
                        <div
                          class="size-37.5 rounded-[25%]"
                          style={`background-color: ${color.hex ?? "transparent"};`}
                        ></div>
                      {/if}
                      <div class="mt-2 text-sm">{color.label}</div>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}

            {#if material.description}
              <Markdown source={material.description} class="text-left" />
            {/if}
          </div>

          <div class="relative z-1 lg:mx-auto lg:w-10/12">
            <DetailNav
              {previous}
              {next}
              previousLabel={i18n.t("common.previous")}
              nextLabel={i18n.t("common.next")}
              {shareUrl}
            />
          </div>
        {/if}
      {/snippet}
    </I18nGate>
  {/snippet}
</CatalogState>
