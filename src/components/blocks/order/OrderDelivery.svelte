<script lang="ts">
  import Icon from "@iconify/svelte";
  import { slide } from "svelte/transition";
  import TextInput from "./common/TextInput.svelte";
  import { formatMoney } from "@/lib/basket/money";
  import type { ShippingQuote } from "@/lib/basket/schemas";

  interface Props {
    methods: ShippingQuote[];
    currencyCode: string;
    shippingMethodId: string;
    address: string;
  }

  let {
    methods,
    currencyCode,
    shippingMethodId = $bindable(),
    address = $bindable(),
  }: Props = $props();
</script>

<div class="flex flex-1 flex-col rounded-xl bg-brown-200 p-4">
  <div class="flex items-center gap-2">
    <Icon icon="mdi:truck-delivery" class="shrink-0 text-2xl text-brown-500" />
    <h4 class="text-lg uppercase">Hogyan szeretnéd megkapni a csomagot?</h4>
  </div>
  <div class="mt-4 flex flex-col gap-2">
    {#each methods as method (method.id)}
      <label class="flex items-center gap-2">
        <input
          class="w-auto"
          type="radio"
          name="shippingMethod"
          value={method.id}
          bind:group={shippingMethodId}
        />
        <div class="flex flex-col">
          <span class="text-sm">{method.name}</span>
          <span class="text-xs text-body">{formatMoney(method.priceWithTax, currencyCode)}</span>
          {#if method.customFields?.requiresAddress && shippingMethodId === method.id}
            <div transition:slide class="mt-1">
              <TextInput placeholder="Add meg a szállítási címet" bind:value={address} />
            </div>
          {/if}
        </div>
      </label>
    {/each}
  </div>
</div>
