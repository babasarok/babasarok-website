<script lang="ts">
    import IconButton from "./IconButton.svelte";
    import type { ProductItem, ProductMaterial } from "../../tina/products";
    import type { Material } from "../../tina/materials";
    import Button from "./Button.svelte";
    import Tooltip from "./Tooltip.svelte";
    import Chip from "./Chip.svelte";

    interface Props {
        product: ProductItem;
        materials: Record<string, Material> | null;
        onChange?: (product: ProductItem) => void;
    }

    const { product, materials, onChange }: Props = $props();

    function resolveValue(accessor: string, product: ProductItem): number | undefined {
        const parts = accessor.split(".");
        let current: any = product;

        for (const part of parts) {
            if (current && part in current) {
                current = current[part];
            } else if (Array.isArray(current)) {
                current = current.find((item) => item.name === part);
            }
        }

        return typeof current?.value?.value === "string" ? Number.parseFloat(current.value.value) : undefined;
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
        <p class="text-sm text-primary-500">Anyag</p>
        <div class="flex gap-1 flex-wrap">
            {#each product.materials as material}
                {@const materialInfo = materials ? materials[material.material] : null}
                {#if materialInfo}
                    {@const selected = product.material_value?.material_id === materialInfo.material_id}
                    <Button
                        type="button"
                        class="flex items-center gap-0.5"
                        {selected}
                        onclick={() => {
                            const result = $state.snapshot(product);
                            result.material_value = {
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
    {#if product.material_value}
        {@const materialInfo = materials
            ? Object.values(materials).find((m) => m.material_id === product.material_value?.material_id)
            : null}
        {@const productMaterial = product.materials
            ? product.materials.find((m) => m.material === `data/materials/${product.material_value?.material_id}.json`)
            : null}
        {#if materialInfo?.colors && materialInfo.colors.length > 0}
            {@const colorCount = generateColorCount(productMaterial!, product)}
            {@const multiColor = (colorCount ?? 0) > 1}
            <div class="flex flex-col gap-1">
                <p class="text-sm text-primary-500 flex items-center gap-1 justify-between">
                    <span> Szín </span>
                    {#if multiColor}
                        <span class="text-xs">
                            ({product.material_value.colors.length ?? 0} / {colorCount})
                        </span>
                    {/if}
                </p>
                {#if multiColor}
                    <div class="flex gap-1 flex-wrap">
                        {#each product.material_value?.colors as colorId, index}
                            {@const colorInfo = materialInfo.colors.find((c) => c.color_id === colorId)}
                            {#if colorInfo}
                                <Chip
                                    color={colorInfo.hex}
                                    onClose={() => {
                                        const result = $state.snapshot(product);
                                        if (result.material_value) {
                                            result.material_value.colors = [
                                                ...result.material_value.colors.slice(0, index),
                                                ...result.material_value.colors.slice(index + 1),
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
                <div class="flex gap-1 flex-wrap">
                    {#each materialInfo?.colors || [] as color}
                        {@const selected = product.material_value?.colors.includes(color.color_id)}
                        <Tooltip
                            disabled={colorCount === undefined ||
                                (multiColor ? (product.material_value?.colors.length ?? 0) >= colorCount : false)}>
                            {#snippet content()}
                                {color.label || color.color_id}
                            {/snippet}
                            <IconButton
                                type="button"
                                disabled={colorCount === undefined ||
                                    (multiColor ? (product.material_value?.colors.length ?? 0) >= colorCount : false)}
                                aria-selected={!multiColor && selected}
                                onclick={() => {
                                    const result = $state.snapshot(product);
                                    if (!result.material_value) {
                                        return;
                                    }

                                    if (multiColor) {
                                        result.material_value.colors.push(color.color_id);
                                    } else {
                                        result.material_value.colors = [color.color_id];
                                    }
                                    onChange?.(result);
                                }}>
                                <div
                                    class={[
                                        "size-5 border-2 rounded-full hover:border-primary-400 transition-all p-px",
                                        !multiColor && selected ? "border-primary-500" : "border-transparent",
                                    ]}>
                                    <div class="rounded-full h-full w-full" style={`background-color: ${color.hex}`}>
                                    </div>
                                </div>
                            </IconButton>
                        </Tooltip>
                    {/each}
                </div>
            </div>
        {/if}
    {/if}
{/if}
