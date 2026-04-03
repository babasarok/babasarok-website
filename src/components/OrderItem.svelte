<script lang="ts">
    import Icon from "@iconify/svelte";
    import IconButton from "./IconButton.svelte";
    import type { Product } from "../../tina/products";

    interface Props {
        onClose: () => void;
        product: Product;
        onChange?: (product: Product) => void;
    }

    let { onClose, product, onChange }: Props = $props();
</script>

<div class="flex flex-col gap-2 rounded-lg border shadow-md border-primary-light p-2 w-full">
    <div class="flex justify-between items-center">
        <div class="flex items-center gap-2 justify-center">
            <Icon icon="mdi:circle" class="text-primary-400 text-4xl" />
            <p>{product.name}</p>
        </div>
        <IconButton onclick={onClose}>
            <Icon icon="mdi:close" />
        </IconButton>
    </div>
    <div class="w-full h-0.5 bg-border"></div>
    {#each Object.values(product.fields).sort((a, b) => (a.order ?? -1) - (b.order ?? -1)) as field}
        <div class="flex flex-col gap-1">
            <p class="text-sm text-primary-500">{field.name}</p>
            <div class="flex gap-1 max-w-80 flex-wrap">
                {#if field.type === "radio" && "items" in field}
                    {#each field.items as item}
                        <p>{"name" in item ? item.name : item.value}</p>
                    {/each}
                {:else if field.type === "select" && "items" in field}
                    <select>
                        {#each field.items as item}
                            <option value={item.value}>
                                {"name" in item ? item.name : item.value}
                            </option>
                        {/each}
                    </select>
                {:else if field.type === "input"}
                    <input type="text" />
                {:else}
                    <p>--</p>
                {/if}
            </div>
        </div>
    {/each}
</div>
