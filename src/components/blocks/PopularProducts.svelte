<script lang="ts">
  import { onMount } from "svelte";
  import { getProducts, type CatalogProduct } from "@/lib/catalog";
  import { listedByPopularity } from "@/lib/catalog/listItems";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import { ASSET_BASE } from "@/lib/vendure/client";
  import { imageSrcSet, imageUrl } from "@/lib/vendure/imageUrl";
  import type { SlimImage } from "@/lib/order/types";
  import type { i18n as I18n } from "i18next";
  import { localizedPath, VENDURE_LANGUAGE_CODE, type Locale } from "@/lib/i18n";

  interface Props {
    locale: Locale;
    itemCount: number;
  }

  let { locale, itemCount }: Props = $props();

  let products = $state<CatalogProduct[]>([]);

  onMount(async () => {
    try {
      const all = listedByPopularity(await getProducts(undefined, VENDURE_LANGUAGE_CODE[locale]));
      products = all.slice(0, itemCount);
    } catch {
      // skeleton stays
    }
  });

  function cardImage(source: string): SlimImage {
    return {
      src: imageUrl(source, "card-lg", ASSET_BASE),
      srcSet: {
        attribute: imageSrcSet(source, ["card-sm", "card-lg"], ASSET_BASE),
      },
      attributes: {
        width: 300,
        height: 300,
        sizes: "(max-width: 575px) 50vw, 300px",
        loading: "lazy",
        decoding: "async",
      },
    };
  }
</script>

{#if products.length === 0}
  <div class="min-h-96" aria-hidden="true"></div>
{:else}
  <I18nGate {locale}>
    {#snippet children(i18n: I18n)}
      <div class="flex flex-wrap justify-center gap-8 gap-y-12 sm:gap-y-8">
        {#each products as product (product.id)}
          <div
            class="group flex w-full max-w-62.5 flex-col items-center p-0 sm:items-stretch lg:w-1/2 lg:p-7.5"
          >
            {#if product.thumbnailUrl}
              <img
                src={cardImage(product.thumbnailUrl).src}
                srcset={cardImage(product.thumbnailUrl).srcSet.attribute}
                width={300}
                height={300}
                sizes="(max-width: 575px) 50vw, 300px"
                alt={product.name}
                loading="lazy"
                decoding="async"
                class="mx-auto aspect-square w-full max-w-[50vw] rounded-[20px] object-cover transition-all duration-300 group-hover:shadow-[0_20px_40px_0_rgba(0,0,0,0.12)] sm:mx-0 sm:max-w-75"
              />
            {/if}
            <div
              class="flex flex-1 flex-col items-center text-center sm:items-stretch sm:text-start"
            >
              {#if product.tagline}
                <span
                  class="text-body mt-3.5 mb-2.5 block text-[0.9rem] leading-none sm:mt-7 sm:mb-5 sm:text-lg"
                >
                  {product.tagline}
                </span>
              {/if}
              <h3 class="text-h3 text-headings mb-0">
                <a
                  class="text-dark hover:text-sand-300"
                  href={localizedPath(`/product/${product.slug}/`, locale)}
                >
                  {product.name}
                </a>
              </h3>
              <a
                href={localizedPath(`/product/${product.slug}/`, locale)}
                class="text-sand-300 before:bg-sand-300 relative ml-7.5 inline-block origin-bottom scale-y-100 transition-all duration-300 group-hover:scale-y-100 before:absolute before:top-1/2 before:-left-7.5 before:h-0.5 before:w-5 before:-translate-y-1/2 before:content-[''] lg:scale-y-0"
              >
                {i18n.t("common.details")}
              </a>
            </div>
          </div>
        {/each}
      </div>
    {/snippet}
  </I18nGate>
{/if}
