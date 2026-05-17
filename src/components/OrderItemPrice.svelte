<script lang="ts">
    import Icon from "@iconify/svelte";
    import Tooltip from "./Tooltip.svelte";
    import type { ProductItem, RadioFieldResolved, SelectFieldResolved } from "../lib/types.svelte";
    import { calculatePriceForItem } from "../lib/priceUtils";

    interface Props {
        product: ProductItem;
    }

    const { product }: Props = $props();

    const price = $derived.by(() => {
        return calculatePriceForItem(product);
    });
</script>

<div class="flex flex-col gap-1">
    <p class="text-sm text-primary-500 flex items-center gap-1 justify-between">
        <span>
            Ár <span class="text-xs">(tájékoztató)</span>
        </span>
        <Tooltip>
            {#snippet content()}
                Az ár tájékoztató jellegű, a végleges árajánlatot a visszajelzéskor kapod meg.
            {/snippet}
            <Icon icon="mdi:alert-circle" class="inline-block text-sm text-orange-500" />
        </Tooltip>
    </p>
    <div class="flex flex-col gap-1 text-xs">
        {#each [price.basePrice, ...price.options] as part, index}
            <div class="flex justify-between">
                <p>{part.label}</p>
                <p>
                    {part.price !== undefined ? `${index != 0 ? "+" : ""}${part.price} Ft` : "??"}
                    {#if price.priced_by_length}
                        /m
                    {/if}
                </p>
            </div>
        {/each}
        <div class="w-full h-0.5 bg-border"></div>
        {#if price.priced_by_length}
            <div class="flex justify-between">
                <p>Méterár</p>
                <p>
                    {price.unitPrice} Ft/m
                </p>
            </div>
        {/if}
        <svelte:boundary>
            <div class={["flex justify-between", { "font-medium": product.count === 1 }]}>
                <p>
                    {#if product.count === 1}
                        Összesen
                    {:else}
                        Darabár
                    {/if}
                </p>
                <p>
                    {price.unitPrice !== undefined ? `${price.unitPrice} Ft` : "??"}
                    {price.indeterminate ? " + ??" : ""}
                </p>
            </div>
            {#if product.count > 1}
                <div class="flex justify-between font-medium">
                    <p>Összesen</p>
                    <p>
                        {price.totalPrice !== undefined ? `${price.totalPrice} Ft` : "??"}
                        {price.indeterminate ? " + ??" : ""}
                    </p>
                </div>
            {/if}
        </svelte:boundary>
    </div>
</div>
