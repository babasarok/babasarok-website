<script lang="ts">
  import Icon from "@iconify/svelte";
  import Tooltip from "./common/Tooltip.svelte";
  import { calculatePriceForItem } from "@/lib/priceUtils";
  import type { IProduct } from "@/lib/Product.svelte";
  import IconButton from "./common/IconButton.svelte";

  interface Props {
    product: IProduct;
    onChange?: ((product: IProduct) => void) | undefined;
  }

  const { product, onChange }: Props = $props();

  const price = $derived.by(() => {
    return calculatePriceForItem(product);
  });

  const priceParts = $derived.by(() => {
    return [price.basePrice, ...price.options].filter(
      (part) => part.price !== undefined && part.price > 0
    );
  });
</script>

<div class="flex flex-col gap-1">
  <div class="flex flex-col gap-1 text-xs">
    {#each priceParts as part, index (part.label)}
      <div class="flex justify-between">
        <p class="text-xs">{part.label}</p>
        <p class="text-xs">
          {part.price === undefined ? "??" : `${part.price} Ft`}
          {#if price.priced_by_length}
            /m
          {/if}
        </p>
      </div>
    {/each}
    {#if priceParts.length > 0}
      <div class="w-full h-0.5 bg-brown-200"></div>
    {/if}
    {#if price.priced_by_length}
      <div class="flex justify-between">
        <p class="text-xs">Méterár</p>
        <p class="text-xs">
          {price.per_meter_price === undefined ? "??" : `${price.per_meter_price} Ft/m`}
        </p>
      </div>
    {/if}
    {#if price.discount !== undefined}
      <div class="flex justify-between">
        <p class="text-xs">Kedvezmény</p>
        <p class="text-xs">
          {(1 - price.discount).toLocaleString(undefined, { style: "percent" })}
        </p>
      </div>
    {/if}
    <svelte:boundary>
      <div class="flex justify-between font-medium">
        <div class="flex items-center gap-1">
          <IconButton
            class="text-sm leading-none"
            type="button"
            disabled={product.count <= 1}
            onclick={() => {
              product.count--;
              onChange?.(product);
            }}
          >
            <Icon icon="mdi:minus" class="h-[1em]" />
          </IconButton>
          <p class="text-xs">{product.count}db</p>
          <IconButton
            class="text-sm leading-none"
            type="button"
            onclick={() => {
              product.count++;
              onChange?.(product);
            }}
          >
            <Icon icon="mdi:add" class="h-[1em]" />
          </IconButton>
        </div>
        <p class="flex gap-0.5 text-xs">
          {price.totalPrice === undefined ? "??" : `${price.totalPrice} Ft`}
          {price.indeterminate ? " + ??" : ""}
          <Tooltip>
            {#snippet content()}
              Az ár tájékoztató jellegű, a végleges árajánlatot a visszajelzéskor kapod meg.
            {/snippet}
            <Icon icon="mdi:alert-circle" class="inline-block text-sm text-orange-500" />
          </Tooltip>
        </p>
      </div>
    </svelte:boundary>
  </div>
</div>
