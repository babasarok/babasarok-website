<script lang="ts">
    import Icon from "@iconify/svelte";
    import IconButton from "./IconButton.svelte";
    import type { Field, ProductItem } from "../../tina/products";
    import type { Material } from "../../tina/materials";
    import type { HTMLAttributes } from "svelte/elements";
    import Tooltip from "./Tooltip.svelte";
    import OrderItemMaterials from "./OrderItemMaterials.svelte";
    import OrderItemFields from "./OrderItemFields.svelte";
    import OrderItemPrice from "./OrderItemPrice.svelte";

    interface Props extends HTMLAttributes<HTMLDivElement> {
        onClose: () => void;
        product: ProductItem;
        onChange?: (product: ProductItem) => void;
        materials: Record<string, Material> | null;
    }

    let { onClose, product, onChange, class: className, materials, ...rest }: Props = $props();
</script>

<div {...rest} class={["flex flex-col gap-2 rounded-xl border shadow-md border-primary-light p-2 w-full", className]}>
    <div class="flex justify-between items-center">
        <div class="flex items-center gap-2 justify-center">
            {#if product.icon}
                <div class="w-8 h-8 bg-primary-400 rounded-full flex items-center justify-center fill-white text-white">
                    <div
                        class="bg-white w-6 h-6"
                        style={`-webkit-mask-image: url(${product.icon}); mask-image: url(${product.icon}); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-position: center; mask-position: center; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;`}>
                    </div>
                </div>
            {:else}
                <Icon icon="mdi:circle" class="text-primary-400 text-4xl" />
            {/if}
            <p>{product.name}</p>
        </div>
        <IconButton type="button" onclick={onClose}>
            <Icon icon="mdi:close" />
        </IconButton>
    </div>
    <div class="w-full h-0.5 bg-border"></div>
    <OrderItemFields {product} {onChange} />
    <OrderItemMaterials {product} {materials} {onChange} />
    <div class="w-full h-0.5 bg-border"></div>
    <OrderItemPrice {product} />
</div>
