<script lang="ts">
    import IconButton from "./common/IconButton.svelte";
    import Button from "./common/Button.svelte";
    import Tooltip from "./common/Tooltip.svelte";
    import Chip from "./common/Chip.svelte";
    import Icon from "@iconify/svelte";
    import Color from "./common/Color.svelte";
    import { slide } from "svelte/transition";
    import type { Product } from "../lib/Product.svelte";

    interface Props {
        product: Product;
        material_index?: number;
        onChange?: ((product: Product) => void) | undefined;
    }

    const { product, onChange, material_index = 0 }: Props = $props();
</script>

{#if product.materials && product.materials.length > 0}
    <div class="flex flex-col gap-1">
        <p class="text-sm text-primary-500">
            {(product.material_required_count ?? 1) == 1 ? "Anyag" : `Anyag ${material_index + 1}`}
        </p>
        <div class="flex gap-1 flex-wrap">
            {#each product.materials as material}
                {@const materialInfo = material.material}
                {#if materialInfo}
                    {@const selected =
                        product.material_values?.[material_index]?.material_id === materialInfo.material_id}
                    <Button
                        type="button"
                        class="flex items-center gap-0.5"
                        {selected}
                        onclick={() => {
                            const result = product;
                            result.material_values = result.material_values || [];
                            result.material_values[material_index] = {
                                material_id: materialInfo.material_id,
                                colors: [],
                            };
                            onChange?.(result);
                        }}>
                        {materialInfo.label || materialInfo.material_id}
                    </Button>
                {/if}
            {/each}
        </div>
    </div>
    {#if product.material_values?.[material_index] && !!product.material_values[material_index].material_id}
        {@const value = product.material_values[material_index]}
        {@const productMaterial = product.materials?.find((m) => m.material.material_id === value?.material_id)}
        {@const materialInfo = productMaterial?.material}
        {@const custom = value.custom_color != undefined || (materialInfo?.colors?.length ?? 0) === 0}
        {@const colorCount = productMaterial?.color_count}
        {@const multiColor = (colorCount ?? 0) > 1}
        {@const disabled = colorCount === undefined || (multiColor ? (value?.colors.length ?? 0) >= colorCount : false)}
        <div class="flex flex-col gap-1">
            <p class="text-sm text-primary-500 flex items-center gap-1 justify-between">
                <span> Szín </span>
                <span class="text-xs">
                    {#if custom}
                        Egyedi szín
                    {:else if colorCount === undefined}
                        <span class="text-red-600">Válaszz először opciót</span>
                    {:else}
                        {`${value?.colors.length ?? 0} / ${colorCount}`}
                    {/if}
                </span>
            </p>
            {#if (materialInfo?.colors?.length ?? 0) > 0}
                <p
                    transition:slide
                    class="text-xs text-primary-500 flex items-center gap-1 border-1 border-primary-light rounded p-1">
                    <Icon icon="mdi:alert-circle" class="inline-block size-6 text-orange-500" />
                    <span> A színek tájékoztató jellegűek, a pontos árnyalatok eltérhetnek. </span>
                </p>
            {/if}
            {#if multiColor}
                <div class="flex gap-1 flex-wrap">
                    {#each value?.colors as colorId, index}
                        {@const colorInfo = materialInfo?.colors?.find((c) => c.color_id === colorId)}
                        {#if colorInfo}
                            <Chip
                                color={colorInfo.hex}
                                onClose={() => {
                                    const result = product;
                                    if (result.material_values?.[material_index]) {
                                        result.material_values[material_index].colors = [
                                            ...result.material_values[material_index].colors.slice(0, index),
                                            ...result.material_values[material_index].colors.slice(index + 1),
                                        ];
                                    }
                                    onChange?.(result);
                                }}>
                                {colorInfo.label || colorInfo.color_id}
                            </Chip>
                        {/if}
                    {/each}
                </div>
            {/if}
            {#if (materialInfo?.colors?.length ?? 0) > 0}
                <div transition:slide class="flex gap-1 flex-wrap">
                    {#each materialInfo?.colors || [] as color (color.color_id)}
                        {@const selected = value?.colors.includes(color.color_id)}
                        <Color
                            {color}
                            {disabled}
                            selected={!multiColor && selected}
                            onclick={() => {
                                const result = product;
                                if (!result.material_values?.[material_index]) {
                                    return;
                                }

                                if (multiColor) {
                                    result.material_values[material_index].colors.push(color.color_id);
                                } else {
                                    result.material_values[material_index].colors = [color.color_id];
                                }
                                result.material_values[material_index].custom_color = undefined;
                                onChange?.(result);
                            }} />
                    {/each}
                </div>
            {/if}
        </div>
        {#if (materialInfo?.colors?.length ?? 0) > 0}
            <Button
                {disabled}
                type="button"
                onclick={() => {
                    const result = product;
                    if (!result.material_values?.[material_index]) {
                        return;
                    }
                    result.material_values[material_index].colors = [];
                    result.material_values[material_index].custom_color = "";
                    onChange?.(result);
                }}>
                Egyéb
            </Button>
        {/if}
        {#if custom}
            <input
                value={value.custom_color}
                oninput={(e) => {
                    const result = product;
                    if (!result.material_values?.[material_index]) {
                        return;
                    }
                    result.material_values[material_index].custom_color = (e.target as HTMLInputElement).value;
                    onChange?.(result);
                }} />
        {/if}
    {/if}
    {#if product.material_values?.[material_index]?.error}
        <p class="text-sm text-red-500">
            {product.material_values[material_index].error}
        </p>
    {/if}
{/if}
