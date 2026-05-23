<script lang="ts">
    import Icon from "@iconify/svelte";
    import Tooltip from "./common/Tooltip.svelte";
    import { calculatePriceForItem } from "../lib/priceUtils";
    import type { Product } from "../lib/Product.svelte";
    import IconButton from "./common/IconButton.svelte";

    interface Props {
        product: Product;
        onChange: (product: Product) => void;
    }

    const { product, onChange }: Props = $props();

    const price = $derived.by(() => {
        return calculatePriceForItem(product);
    });
</script>

<div class="flex flex-col gap-1">
    <div class="flex flex-col gap-1 text-xs">
        {#each [price.basePrice, ...price.options] as part, index}
            <div class="flex justify-between">
                <p>{part.label}</p>
                <p>
                    {part.price !== undefined ? `${part.price} Ft` : "??"}
                    {#if price.priced_by_length}
                        /m
                    {/if}
                </p>
            </div>
        {/each}
        <div class="w-full h-0.5 bg-border"></div>
        <div class="flex justify-end items-center gap-1">
            <IconButton
                type="button"
                disabled={product.count <= 1}
                onclick={() => {
                    product.count--;
                    onChange?.(product);
                }}>
                <Icon icon="mdi:minus" />
            </IconButton>
            <p>{product.count}db</p>
            <IconButton
                type="button"
                onclick={() => {
                    product.count++;
                    onChange?.(product);
                }}>
                <Icon icon="mdi:add" />
            </IconButton>
        </div>
        {#if price.priced_by_length}
            <div class="flex justify-between">
                <p>Méterár</p>
                <p>
                    {price.per_meter_price !== undefined ? `${price.per_meter_price} Ft/m` : "??"}
                </p>
            </div>
        {/if}
        <svelte:boundary>
            <div class={["flex justify-between", { "font-medium": product.count === 1 }]}>
                <p class="flex items-center gap-1">
                    {#if product.count === 1}
                        Összesen <Tooltip>
                            {#snippet content()}
                                Az ár tájékoztató jellegű, a végleges árajánlatot a visszajelzéskor kapod meg.
                            {/snippet}
                            <Icon icon="mdi:alert-circle" class="inline-block text-sm text-orange-500" />
                        </Tooltip>
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
                    <p class="flex items-center gap-1">
                        Összesen <Tooltip>
                            {#snippet content()}
                                Az ár tájékoztató jellegű, a végleges árajánlatot a visszajelzéskor kapod meg.
                            {/snippet}
                            <Icon icon="mdi:alert-circle" class="inline-block text-sm text-orange-500" />
                        </Tooltip>
                    </p>
                    <p>
                        {price.totalPrice !== undefined ? `${price.totalPrice} Ft` : "??"}
                        {price.indeterminate ? " + ??" : ""}
                    </p>
                </div>
            {/if}
        </svelte:boundary>
    </div>
</div>
