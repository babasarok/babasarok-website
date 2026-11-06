<script lang="ts">
  import Icon from "@iconify/svelte";
  import SetSiblingCard from "./SetSiblingCard.svelte";
  import type { OrderProduct } from "@/lib/order/types";

  interface Props {
    setTitle: string;
    relatedProducts: OrderProduct[];
    basketCountByProductId?: Record<string, number>;
    slugByProductId?: Record<string, string | undefined>;
    ready: boolean;
    onAddRelated: (target: OrderProduct) => void;
  }

  let {
    setTitle,
    relatedProducts,
    basketCountByProductId = {},
    slugByProductId = {},
    ready,
    onAddRelated,
  }: Props = $props();
</script>

<section class="flex flex-col gap-3 rounded-2xl border border-brown-200 bg-brown-50 p-4">
  <div class="flex items-start gap-2">
    <Icon icon="mdi:tag-multiple-outline" class="mt-0.5 shrink-0 text-xl text-brown-500" />
    <div class="flex flex-col gap-0.5">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-semibold uppercase tracking-wide text-brown-500">
          {setTitle} szett
        </span>
      </div>
      <p class="text-sm text-brown-600">
        Vedd meg együtt a szett darabjaival, és kedvezményt kapsz. A kedvezmény a kosárban jelenik
        meg.
      </p>
    </div>
  </div>

  <div class="flex flex-wrap gap-3">
    {#each relatedProducts as related (related.product_id)}
      {@const slug = slugByProductId[related.product_id]}
      <SetSiblingCard
        product={related}
        href={slug ? `/product/${slug}/` : undefined}
        added={basketCountByProductId[related.product_id] ?? 0}
        disabled={!ready}
        onAdd={() => onAddRelated(related)}
      />
    {/each}
  </div>

  {#if !ready}
    <p class="flex items-start gap-1 text-xs text-brown-500">
      <Icon icon="mdi:information-outline" class="mt-0.5 shrink-0" />
      Előbb töltsd ki ennek a terméknek az adatait, utána adhatod hozzá a szett darabjait.
    </p>
  {/if}
</section>
