<script lang="ts">
  import type { ProductDefinition } from "@babasarok/product-definition";
  import { priceBreakdown } from "@/lib/order/priceBreakdown";
  import { liveUnitPrice } from "@/lib/catalog/livePrice";
  import type { IProduct } from "@/lib/types.svelte";

  interface Props {
    product: IProduct;
    definition: ProductDefinition;
  }

  const { product, definition }: Props = $props();

  const breakdown = $derived(priceBreakdown(product));

  const unitPrice = $derived(liveUnitPrice(definition, product.title, product) ?? undefined);

  const price = $derived({
    ...breakdown,
    unitPrice,
    totalPrice: unitPrice === undefined ? undefined : unitPrice * product.count,
  });

  const activeOptions = $derived.by(() => {
    return price.options.filter((opt) => opt.price !== undefined && opt.price > 0);
  });

  const hasBreakdown = $derived.by(() => {
    return activeOptions.length > 0 || price.priced_by_length || product.count > 1;
  });
</script>

<div class="flex flex-col gap-1.5">
  <div class="w-full h-px bg-brown-200"></div>
  {#if hasBreakdown}
    <div class="flex flex-col gap-1 text-xs text-brown-600">
      <div class="flex justify-between">
        <p>Alapár</p>
        <p>
          {price.basePrice.price === undefined
            ? "??"
            : `${price.basePrice.price.toLocaleString("hu-HU")} Ft`}
          {#if price.priced_by_length}
            /m
          {/if}
        </p>
      </div>

      {#each activeOptions as opt (opt.label)}
        <div class="flex justify-between">
          <p>{opt.label}</p>
          <p>+{opt.price?.toLocaleString("hu-HU")} Ft</p>
        </div>
      {/each}

      {#if price.priced_by_length}
        <div class="flex justify-between">
          <p>Méterár</p>
          <p>
            {price.per_meter_price === undefined
              ? "??"
              : `${price.per_meter_price.toLocaleString("hu-HU")} Ft/m`}
          </p>
        </div>
      {/if}

      {#if product.count > 1 && (activeOptions.length > 0 || price.priced_by_length)}
        <div class="flex justify-between font-medium text-brown-700">
          <p>Egységár</p>
          <p>
            {price.unitPrice === undefined ? "??" : `${price.unitPrice.toLocaleString("hu-HU")} Ft`}
          </p>
        </div>
      {/if}
    </div>

    <div class="w-full h-px bg-brown-200"></div>
  {/if}

  <div class="flex justify-between items-baseline pt-0.5">
    <p class="text-sm font-medium">
      Összesen
      {#if product.count > 1}
        <span class="text-xs font-normal text-brown-500">({product.count} db)</span>
      {/if}
    </p>
    <p class="text-base font-semibold text-brown-800">
      {price.totalPrice === undefined ? "--" : `${price.totalPrice.toLocaleString("hu-HU")} Ft`}
    </p>
  </div>
</div>
