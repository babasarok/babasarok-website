<script lang="ts">
  import Icon from "@iconify/svelte";
  import type { CmsEnhancedProduct } from "@/lib/data";

  interface RelatedGroup {
    title: string;
    products: CmsEnhancedProduct[];
  }

  interface Props {
    /**
     * No-discount product groups this product belongs to, each rendered as its
     * own separate list of related items. A product in several such groups shows
     * several lists, one per group.
     */
    groups: RelatedGroup[];
    slugByProductId?: Record<string, string | undefined>;
  }

  let { groups, slugByProductId = {} }: Props = $props();
</script>

<section class="flex flex-col gap-4 rounded-2xl border border-brown-200 bg-brown-50 p-4">
  <div class="flex items-center gap-2">
    <Icon icon="mdi:link-variant" class="shrink-0 text-xl text-brown-500" />
    <h2 class="text-sm font-semibold uppercase tracking-wide text-brown-500">
      Kapcsolódó termékek
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
            href={slug ? `/product/${slug}/` : undefined}
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
