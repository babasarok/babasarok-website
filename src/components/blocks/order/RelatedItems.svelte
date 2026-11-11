<script lang="ts">
  import Icon from "@iconify/svelte";
  import type { OrderProduct } from "@/lib/order/types";
  import type { i18n as I18n } from "i18next";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import { localizedPath, type Locale } from "@/lib/i18n";
  import { productPath } from "@/lib/order/queryParams";

  interface RelatedGroup {
    title: string;
    products: OrderProduct[];
  }

  interface Props {
    locale: Locale;
    /**
     * No-discount product groups this product belongs to, each rendered as its
     * own separate list of related items. A product in several such groups shows
     * several lists, one per group.
     */
    groups: RelatedGroup[];
    slugByProductId?: Record<string, string | undefined>;
  }

  let { locale, groups, slugByProductId = {} }: Props = $props();
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    <section class="flex flex-col gap-4 rounded-2xl border border-brown-200 bg-brown-50 p-4">
      <div class="flex items-center gap-2">
        <Icon icon="mdi:link-variant" class="shrink-0 text-xl text-brown-500" />
        <h2 class="text-sm font-semibold uppercase tracking-wide text-brown-500">
          {i18n.t("related.title")}
        </h2>
      </div>

      {#each groups as group (group.title)}
        <div class="flex flex-col gap-2">
          {#if groups.length > 1}
            <p class="text-xs font-medium text-brown-500">{group.title}</p>
          {/if}
          <div class="flex flex-wrap gap-3">
            {#each group.products as related (related.product_id)}
              {@const slug = slugByProductId[related.product_id]}
              <a
                href={slug ? localizedPath(productPath(slug), locale) : undefined}
                class="flex w-40 shrink-0 flex-col overflow-hidden rounded-xl border border-brown-200 bg-white transition-shadow hover:shadow-md"
              >
                <div class="aspect-square bg-brown-50">
                  {#if related.thumbnail}
                    <img
                      src={related.thumbnail.src}
                      srcset={related.thumbnail.srcSet.attribute || undefined}
                      {...related.thumbnail.attributes}
                      alt={related.title}
                      class="size-full object-cover"
                    />
                  {:else}
                    <div class="grid size-full place-items-center text-brown-300">
                      <Icon icon="mdi:image-outline" class="text-3xl" />
                    </div>
                  {/if}
                </div>
                <div class="flex flex-1 flex-col gap-1 p-2">
                  <p class="text-sm font-medium leading-tight text-dark">{related.title}</p>
                  {#if related.price}
                    <p class="text-xs text-brown-500">{related.price} Ft-tól</p>
                  {/if}
                </div>
              </a>
            {/each}
          </div>
        </div>
      {/each}
    </section>
  {/snippet}
</I18nGate>
