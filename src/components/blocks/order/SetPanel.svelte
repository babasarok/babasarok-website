<script lang="ts">
  import Icon from "@iconify/svelte";
  import SetSiblingCard from "./SetSiblingCard.svelte";
  import type { CmsEnhancedProduct } from "@/lib/data";
  import type { SetDiscountStatus } from "@/lib/pricing/setDiscount";

  interface Props {
    setTitle: string;
    percent?: number | undefined;
    setStatus?: SetDiscountStatus | undefined;
    relatedProducts: CmsEnhancedProduct[];
    relatedDiscounts?: Record<string, number>;
    basketCountByProductId?: Record<string, number>;
    slugByProductId?: Record<string, string | undefined>;
    ready: boolean;
    onAddRelated: (target: CmsEnhancedProduct) => void;
    onSyncToSet?: (() => void) | undefined;
  }

  let {
    setTitle,
    percent,
    setStatus,
    relatedProducts,
    relatedDiscounts = {},
    basketCountByProductId = {},
    slugByProductId = {},
    ready,
    onAddRelated,
    onSyncToSet,
  }: Props = $props();

  const active = $derived(setStatus?.state === "active");
</script>

<section
  class={[
    "flex flex-col gap-3 rounded-2xl border p-4",
    active ? "border-success-600 bg-success-50" : "border-brown-200 bg-brown-50",
  ]}
>
  <div class="flex items-start gap-2">
    <Icon
      icon="mdi:tag-multiple-outline"
      class={["mt-0.5 shrink-0 text-xl", active ? "text-success-700" : "text-brown-500"]}
    />
    <div class="flex flex-col gap-0.5">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-semibold uppercase tracking-wide text-brown-500">
          {setTitle} szett
        </span>
        {#if percent}
          <span
            class={[
              "rounded-full px-2 py-0.5 text-xs font-semibold",
              active ? "bg-success-600 text-white" : "bg-success-100 text-success-800",
            ]}
          >
            -{percent}%
          </span>
        {/if}
      </div>
      <p class="text-sm text-brown-600">
        {#if active}
          A szett kedvezmény aktív ezen a darabon.
        {:else if percent}
          Vedd meg együtt a szett darabjaival, és {percent}% kedvezményt kapsz mindegyikre.
        {:else}
          Ezek a darabok együtt alkotják a szettet.
        {/if}
      </p>
    </div>
  </div>

  <div class="flex flex-wrap gap-3">
    {#each relatedProducts as related (related.product_id)}
      {@const slug = slugByProductId[related.product_id]}
      <SetSiblingCard
        product={related}
        href={slug ? `/product/${slug}/` : undefined}
        discount={relatedDiscounts[related.product_id]}
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
  {:else if setStatus?.state === "pending-material"}
    <div class="flex flex-wrap items-center gap-2 text-xs text-brown-600">
      <span>Egyeztesd az anyagot a szett darabjához a kedvezményhez.</span>
      {#if setStatus.canSync && onSyncToSet}
        <button
          type="button"
          onclick={onSyncToSet}
          class="flex cursor-pointer items-center gap-1 rounded-full border border-brown-300 px-3 py-1 font-medium transition-all hover:bg-brown-100"
        >
          <Icon icon="mdi:sync" class="shrink-0" />
          Anyag egyeztetése
        </button>
      {/if}
    </div>
  {:else if setStatus?.state === "pending-partner"}
    <p class="text-xs text-brown-500">
      Add hozzá a szett egy másik darabját, és megkapod a kedvezményt.
    </p>
  {/if}
</section>
