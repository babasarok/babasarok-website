<script lang="ts">
  import type { i18n as I18n } from "i18next";
  import ProductOrder from "@/components/blocks/order/ProductOrder.svelte";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import Markdown from "@/components/ui/Markdown.svelte";
  import ProductGallery from "@/components/ui/ProductGallery.svelte";
  import { toProductPageData } from "@/lib/catalog/productPage";
  import { remoteValue } from "@/lib/catalog/remote.svelte";
  import { bothReady, catalogStore } from "@/lib/catalog/store";
  import type { Locale } from "@/lib/i18n";
  import { ASSET_BASE } from "@/lib/vendure/client";
  import CatalogState from "./CatalogState.svelte";
  import DetailNav from "./DetailNav.svelte";

  interface Props {
    locale: Locale;
    slug: string;
    shareUrl: string;
  }

  let { locale, slug, shareUrl }: Props = $props();

  const catalog = remoteValue(() => catalogStore.catalog(locale));
  const product = remoteValue(() => catalogStore.product(locale, slug));
  const remote = $derived(bothReady(catalog.current, product.current));

  function retry(): void {
    catalog.retry();
    product.retry();
  }

  $effect(() => {
    if (product.current.status !== "ready" || product.current.value === null) {
      return;
    }

    document.title = product.current.value.name;
  });
</script>

<CatalogState {locale} {remote} {retry}>
  {#snippet skeleton()}
    <div class="mb-12 grid animate-pulse grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-16">
      <div class="bg-brown-100 h-75 rounded-[20px] sm:h-125"></div>
      <div class="flex flex-col gap-4">
        <div class="bg-brown-100 h-10 w-2/3 rounded-md"></div>
        <div class="bg-brown-100 h-5 w-full rounded-md"></div>
        <div class="bg-brown-100 h-5 w-5/6 rounded-md"></div>
        <div class="bg-brown-100 mt-6 h-64 rounded-[20px]"></div>
      </div>
    </div>
  {/snippet}

  {#snippet children([loadedCatalog, loadedProduct])}
    <I18nGate {locale}>
      {#snippet children(i18n: I18n)}
        {#if loadedProduct === null}
          <p class="py-12 text-center">{i18n.t("catalog.productNotFound")}</p>
        {:else}
          {@const page = toProductPageData(loadedProduct, loadedCatalog, locale, ASSET_BASE)}
          <div class="relative z-1 mb-12">
            <div class="grid grid-cols-1 items-start justify-start gap-8 lg:grid-cols-2 lg:gap-16">
              <div class="lg:sticky">
                <ProductGallery
                  images={page.gallery}
                  previousLabel={i18n.t("common.previousImage")}
                  nextLabel={i18n.t("common.nextImage")}
                />
              </div>
              <div class="flex flex-col text-left">
                <h1 class="text-h2 text-headings">{loadedProduct.name}</h1>
                {#if loadedProduct.shortDescription}
                  <p class="mt-3">{loadedProduct.shortDescription}</p>
                {/if}
                <div class="mt-6">
                  <ProductOrder
                    {locale}
                    slug={loadedProduct.slug}
                    product={page.orderProduct}
                    definition={page.definition}
                    products={page.orderCatalog}
                    productGroups={page.productGroups}
                    slugByProductId={page.slugByProductId}
                    threadColors={page.threadColors}
                  />
                </div>
              </div>
            </div>

            {#if loadedProduct.description}
              <Markdown source={loadedProduct.description} class="mt-12" />
            {/if}
          </div>

          <div class="relative z-1 lg:mx-auto lg:w-10/12">
            <DetailNav
              previous={page.previous}
              next={page.next}
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
