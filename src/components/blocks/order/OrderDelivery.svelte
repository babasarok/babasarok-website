<script lang="ts">
  import Icon from "@iconify/svelte";
  import { marked } from "marked";
  import { chargedDeliveryPrice, isDeliveryFree } from "@/lib/order/total";
  import type { BasketPricing } from "@/lib/pricing/setDiscount";
  import type { CmsEnhancedDeliveryMethod } from "@/lib/data";
  import TextInput from "./common/TextInput.svelte";
  import { slide } from "svelte/transition";

  interface Props {
    deliveryMethods: Record<string, CmsEnhancedDeliveryMethod> | null;
    deliveryMethod: string;
    address: string;
    /** The basket's resolved pricing; each method's `free_above` threshold is judged on its `productsSubtotal`. */
    pricing: BasketPricing;
  }

  let {
    deliveryMethods,
    deliveryMethod = $bindable(),
    address = $bindable(),
    pricing,
  }: Props = $props();
</script>

<div class="flex flex-1 flex-col rounded-xl bg-brown-200 p-4">
  <div class="flex items-center gap-2">
    <Icon icon="mdi:truck-delivery" class="shrink-0 text-2xl  text-brown-500" />
    <h4 class="text-lg uppercase">Hogyan szeretnéd megkapni a csomagot?</h4>
  </div>
  <div class="flex flex-col gap-2 mt-4">
    {#each Object.values(deliveryMethods || {}) as method (method.delivery_name)}
      {@const charged = chargedDeliveryPrice(method, pricing)}
      <label class="flex items-center gap-2">
        <input
          class="w-auto"
          type="radio"
          name="deliveryMethod"
          value={method.delivery_name}
          bind:group={deliveryMethod}
        />
        <div class="flex flex-col">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          <span class="text-sm">{@html marked(method.name)}</span>
          <span class="flex items-center gap-1.5 text-xs text-body">
            {#if isDeliveryFree(method, charged)}
              <span class="line-through opacity-60">{method.price} Ft</span>
              <span class="font-semibold text-success-700">Ingyenes</span>
            {:else}
              <span>{charged} Ft</span>
            {/if}
            {#if method.free_above != null && charged !== 0}
              <span class="text-brown-500">
                · Ingyenes {method.free_above.toLocaleString("hu-HU")} Ft felett
              </span>
            {/if}
          </span>
          {#if method.needs_address && deliveryMethod === method.delivery_name}
            <div transition:slide class="mt-1">
              <TextInput placeholder="Add meg a szállítási címet" bind:value={address} />
            </div>
          {/if}
        </div>
      </label>
    {/each}
  </div>
</div>
