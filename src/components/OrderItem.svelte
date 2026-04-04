<script lang="ts">
    import Icon from "@iconify/svelte";
    import IconButton from "./IconButton.svelte";
    import type { Product, ProductItem } from "../../tina/products";
    import Button from "./Button.svelte";
    import type { HTMLAttributes } from "svelte/elements";

    interface Props extends HTMLAttributes<HTMLDivElement> {
        onClose: () => void;
        product: ProductItem;
        onChange?: (product: ProductItem) => void;
    }

    let { onClose, product, onChange, class: className, ...rest }: Props = $props();
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
    {#each product.fields as field}
        <div class="flex flex-col gap-1">
            <p class="text-sm text-primary-500">{field.label || field.name}</p>
            <div class="flex gap-1 max-w-80 flex-wrap">
                {#if field.type === "radio" && "items" in field}
                    {#each field.items as item}
                        {@const selected = field.value === item.value}
                        <Button
                            type="button"
                            {selected}
                            onclick={() => {
                                const result = $state.snapshot(product);
                                const fieldToUpdate = result.fields.find((f) => f.name === field.name);
                                if (fieldToUpdate) {
                                    fieldToUpdate.value = item.value;
                                    onChange?.(result);
                                }
                            }}>
                            {"name" in item ? item.name : item.value}
                        </Button>
                    {/each}
                {:else if field.type === "select" && "items" in field}
                    <select
                        value={field.value}
                        onchange={(e) => {
                            if (!(e.target instanceof HTMLSelectElement)) {
                                return;
                            }

                            const result = $state.snapshot(product);
                            const fieldToUpdate = result.fields.find((f) => f.name === field.name);
                            if (fieldToUpdate) {
                                fieldToUpdate.value = e.target.value;
                                onChange?.(result);
                            }
                        }}>
                        <option value="" disabled selected>{field.placeholder || "Válassz egy opciót"}</option>
                        {#each field.items as item}
                            <option value={item.value}>
                                {"name" in item ? item.name : item.value}
                            </option>
                        {/each}
                    </select>
                {:else if field.type === "input"}
                    <input
                        type="text"
                        value={field.value}
                        oninput={(e) => {
                            if (!(e.target instanceof HTMLInputElement)) {
                                return;
                            }

                            const result = $state.snapshot(product);
                            const fieldToUpdate = result.fields.find((f) => f.name === field.name);
                            if (fieldToUpdate) {
                                fieldToUpdate.value = e.target.value;
                                onChange?.(result);
                            }
                        }} />
                {:else}
                    <p>--</p>
                {/if}
            </div>
        </div>
    {/each}
</div>
