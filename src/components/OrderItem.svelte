<script lang="ts">
    import Icon from "@iconify/svelte";
    import IconButton from "./common/IconButton.svelte";
    import type { HTMLAttributes } from "svelte/elements";
    import Tooltip from "./common/Tooltip.svelte";
    import OrderItemMaterials from "./OrderItemMaterials.svelte";
    import OrderItemFields from "./OrderItemFields.svelte";
    import OrderItemPrice from "./OrderItemPrice.svelte";
    import type { Product } from "../lib/Product.svelte";

    interface Props extends HTMLAttributes<HTMLDivElement> {
        onClose: () => void;
        product: Product;
        onChange?: (product: Product) => void;
    }

    let { onClose, product, onChange, class: className, ...rest }: Props = $props();
</script>

<div {...rest} class={["flex flex-col gap-2 rounded-xl border shadow-md border-primary-light p-2 w-full", className]}>
    <div class="flex items-center">
        <div class="flex items-center gap-2 flex-1 overflow-hidden">
            {#if product.icon}
                <div
                    class="shrink-0 w-8 h-8 bg-primary-400 rounded-full flex items-center justify-center fill-white text-white">
                    <div
                        class="bg-white w-6 h-6"
                        style={`-webkit-mask-image: url(${product.icon}); mask-image: url(${product.icon}); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-position: center; mask-position: center; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;`}>
                    </div>
                </div>
            {:else}
                <Icon icon="mdi:circle" class="text-primary-400 text-4xl shrink-0" />
            {/if}
            <p class="whitespace-nowrap overflow-hidden text-ellipsis">{product.name}</p>
        </div>
        <IconButton class="shrink-0" type="button" onclick={onClose}>
            <Icon icon="mdi:close" />
        </IconButton>
    </div>
    <div class="w-full h-0.5 bg-border"></div>
    <OrderItemFields {product} {onChange} />
    {#each Array(product.material_required_count ?? 1) as _, i}
        <OrderItemMaterials {product} {onChange} material_index={i} />
    {/each}
    <div class="w-full h-0.5 bg-border"></div>
    <div class="flex justify-between items-center">
        <IconButton
            type="button"
            disabled={product.count <= 1}
            onclick={() => {
                product.count--;
                onChange?.(product);
            }}>
            <Icon icon="mdi:minus" />
        </IconButton>
        <p class="text-sm text-primary-500">Mennyiség: {product.count}</p>
        <IconButton
            type="button"
            onclick={() => {
                product.count++;
                onChange?.(product);
            }}>
            <Icon icon="mdi:add" />
        </IconButton>
    </div>
    <div class="w-full h-0.5 bg-border"></div>
    <OrderItemPrice {product} />
</div>
