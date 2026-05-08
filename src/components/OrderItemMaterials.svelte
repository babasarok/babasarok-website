<script lang="ts">
    import IconButton from "./IconButton.svelte";
    import type { ProductItem, ProductMaterial } from "../../tina/products";
    import type { Material } from "../../tina/materials";
    import Button from "./Button.svelte";
    import Tooltip from "./Tooltip.svelte";
    import Chip from "./Chip.svelte";
    import Icon from "@iconify/svelte";
    import Color from "./Color.svelte";
    import { slide } from "svelte/transition";

    interface Props {
        product: ProductItem;
        material_index?: number;
        materials: Record<string, Material> | null;
        onChange?: (product: ProductItem) => void;
    }

    const { product, materials, onChange, material_index = 0 }: Props = $props();

    function resolveValue(name: string, product: ProductItem): number | undefined {
        const current = product.fields?.find((f) => f.name === name)?.value?.value;

        if (!current) {
            return undefined;
        }

        const val = Number.parseFloat(current);

        if (Number.isNaN(val)) {
            return undefined;
        }

        return val;
    }

    function generateColorCount(material: ProductMaterial, product: ProductItem): number | undefined {
        if (material.color_count === undefined) {
            return 1;
        }

        const val = Number.parseFloat(material.color_count);

        if (Number.isNaN(val)) {
            return resolveValue(material.color_count, product);
        }

        return val;
    }
</script>

{#if product.materials && product.materials.length > 0}
    <div class="flex flex-col gap-1">
        <p class="text-sm text-primary-500">
            {(product.material_required_count ?? 0) == 1 ? "Anyag" : `Anyag ${material_index + 1}`}
        </p>
        <div class="flex gap-1 flex-wrap">
            {#each product.materials as material}
                {@const materialInfo = materials ? materials[material.material] : null}
                {#if materialInfo}
                    {@const selected =
                        product.material_values?.[material_index]?.material_id === materialInfo.material_id}
                    <Button
                        type="button"
                        class="flex items-center gap-0.5"
                        {selected}
                        onclick={() => {
                            const result = $state.snapshot(product);
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
    {#if product.material_values?.[material_index]}
        {@const materialInfo = materials
            ? Object.values(materials).find(
                  (m) => m.material_id === product.material_values?.[material_index]?.material_id
              )
            : null}
        {@const productMaterial = product.materials
            ? product.materials.find(
                  (m) => m.material === `data/materials/${product.material_values?.[material_index]?.material_id}.json`
              )
            : null}
        {@const colorCount = generateColorCount(productMaterial!, product)}
        {@const multiColor = (colorCount ?? 0) > 1}
        {@const disabled =
            colorCount === undefined ||
            (multiColor ? (product.material_values?.[material_index]?.colors.length ?? 0) >= colorCount : false)}
        <div class="flex flex-col gap-1">
            <p class="text-sm text-primary-500 flex items-center gap-1 justify-between">
                <span> Szín </span>
                {#if multiColor}
                    <span class="text-xs">
                        ({product.material_values?.[material_index]?.colors.length ?? 0} / {colorCount})
                    </span>
                {/if}
            </p>
            {#if (materialInfo?.colors.length ?? 0) > 0}
                <p
                    transition:slide
                    class="text-xs text-primary-500 flex items-center gap-1 border-1 border-primary-light rounded p-1">
                    <Icon icon="mdi:alert-circle" class="inline-block size-6 text-orange-500" />
                    <span> A színek tájékoztató jellegűek, a pontos árnyalatok eltérhetnek. </span>
                </p>
            {/if}
            {#if multiColor}
                <div class="flex gap-1 flex-wrap">
                    {#each product.material_values?.[material_index]?.colors as colorId, index}
                        {@const colorInfo = materialInfo?.colors.find((c) => c.color_id === colorId)}
                        {#if colorInfo}
                            <Chip
                                color={colorInfo.hex}
                                onClose={() => {
                                    const result = $state.snapshot(product);
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
            {#if (materialInfo?.colors.length ?? 0) > 0}
                <div transition:slide class="flex gap-1 flex-wrap">
                    {#each materialInfo?.colors || [] as color}
                        {@const selected = product.material_values?.[material_index]?.colors.includes(color.color_id)}
                        <Color
                            {color}
                            {disabled}
                            selected={!multiColor && selected}
                            onclick={() => {
                                const result = $state.snapshot(product);
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
        {#if (materialInfo?.colors.length ?? 0) > 0}
            <Button
                {disabled}
                type="button"
                onclick={() => {
                    const result = $state.snapshot(product);
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
        {#if product.material_values?.[material_index]?.custom_color != undefined || (materialInfo?.colors.length ?? 0) === 0}
            <input
                value={product.material_values?.[material_index]?.custom_color}
                oninput={(e) => {
                    const result = $state.snapshot(product);
                    if (!result.material_values?.[material_index]) {
                        return;
                    }
                    result.material_values[material_index].custom_color = (e.target as HTMLInputElement).value;
                    onChange?.(result);
                }} />
        {/if}
    {/if}
{/if}
