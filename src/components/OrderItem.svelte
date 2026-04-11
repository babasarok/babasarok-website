<script lang="ts">
    import Icon from "@iconify/svelte";
    import IconButton from "./IconButton.svelte";
    import type { Field, Product, ProductItem, RadioField, SelectField } from "../../tina/products";
    import type { Material } from "../../tina/materials";
    import Button from "./Button.svelte";
    import type { HTMLAttributes } from "svelte/elements";
    import { derived } from "svelte/store";
    import Tooltip from "./Tooltip.svelte";
    import { v4 } from "uuid";

    interface Props extends HTMLAttributes<HTMLDivElement> {
        onClose: () => void;
        product: ProductItem;
        onChange?: (product: ProductItem) => void;
        materials: Record<string, Material> | null;
    }

    let { onClose, product, onChange, class: className, materials, ...rest }: Props = $props();

    interface PricePart {
        label: string;
        price: number | undefined;
    }

    const priceParts = $derived.by(() => {
        let priceParts: PricePart[] = [];
        priceParts.push({ label: "Alapár", price: product.price });
        for (const field of product.fields) {
            if (field.length_based_pricing_source) {
                continue;
            }

            switch (field.type) {
                case "radio":
                case "select": {
                    const items = (field as RadioField | SelectField).items;
                    const selectedItem = items.find((item) => item.value === field.value?.value);
                    priceParts.push({ label: field.label || field.name, price: selectedItem?.price ?? 0 });
                    break;
                }
                default:
                    break;
            }
        }
        return priceParts;
    });
</script>

{#snippet Input(field: Field)}
    {#if field.type === "input" || field.value?.is_custom}
        {@const id = v4()}
        <input
            type="text"
            value={field.value?.value ?? ""}
            list={field.type === "input" && field.items ? id : undefined}
            oninput={(e) => {
                if (!(e.target instanceof HTMLInputElement)) {
                    return;
                }

                const result = $state.snapshot(product);
                const fieldToUpdate = result.fields.find((f) => f.name === field.name);
                if (fieldToUpdate) {
                    fieldToUpdate.value = {
                        value: e.target.value,
                        is_custom: field.value?.is_custom || false,
                    };
                    if (field.regex) {
                        const regex = new RegExp(field.regex);
                        if (!regex.test(e.target.value)) {
                            fieldToUpdate.value.error = "Érvénytelen érték";
                        } else {
                            delete fieldToUpdate.value.error;
                        }
                    }
                    onChange?.(result);
                }
            }} />
        {#if field.type === "input" && field.items}
            <datalist {id}>
                {#each field.items as item}
                    <option value={item.value}>{item.label}</option>
                {/each}
            </datalist>
        {/if}
    {/if}
    {#if field.value?.error}
        <p class="text-sm text-red-500">{field.value.error}</p>
    {/if}
{/snippet}

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
    <!-- Generic fields -->
    {#each product.fields as field}
        <div class="flex flex-col gap-1">
            <p class="text-sm text-primary-500">{field.label || field.name}</p>
            <div class="flex gap-1 flex-wrap">
                {#if field.type === "radio" && "items" in field}
                    {#each field.items as item}
                        {@const selected = field.value?.value === item.value}
                        {#snippet button(hasTooltip: boolean)}
                            <Button
                                type="button"
                                class="flex items-center gap-0.5"
                                {selected}
                                onclick={() => {
                                    const result = $state.snapshot(product);
                                    const fieldToUpdate = result.fields.find((f) => f.name === field.name);
                                    if (fieldToUpdate) {
                                        fieldToUpdate.value = {
                                            value: item.value,
                                            is_custom: false,
                                        };
                                        onChange?.(result);
                                    }
                                }}>
                                {item.label || item.value}
                                {#if hasTooltip}
                                    <Icon icon="material-symbols:question-mark-rounded" class="text-xs" />
                                {/if}
                            </Button>
                        {/snippet}
                        {#if item.tooltip}
                            <Tooltip contentProps={{ class: "inline-block" }}>
                                {#snippet content()}
                                    {item.tooltip}
                                {/snippet}
                                {@render button(true)}
                            </Tooltip>
                        {:else}
                            {@render button(false)}
                        {/if}
                    {/each}
                    {#if field.allow_custom_value}
                        <Button
                            type="button"
                            selected={field.value?.is_custom}
                            onclick={() => {
                                const result = $state.snapshot(product);
                                const fieldToUpdate = result.fields.find((f) => f.name === field.name);
                                if (fieldToUpdate) {
                                    fieldToUpdate.value = {
                                        value: "",
                                        is_custom: true,
                                    };
                                    onChange?.(result);
                                }
                            }}>
                            Egyéb
                        </Button>
                    {/if}
                    {@render Input(field)}
                {:else if field.type === "select" && "items" in field}
                    <select
                        value={field.value?.value}
                        onchange={(e) => {
                            if (!(e.target instanceof HTMLSelectElement)) {
                                return;
                            }

                            const result = $state.snapshot(product);
                            const fieldToUpdate = result.fields.find((f) => f.name === field.name);
                            if (fieldToUpdate) {
                                fieldToUpdate.value = {
                                    value: e.target.value,
                                    is_custom: false,
                                };
                                onChange?.(result);
                            }
                        }}>
                        <option value="" disabled selected>{field.placeholder || "Válassz egy opciót"}</option>
                        {#each field.items as item}
                            <option value={item.value}>
                                {item.label || item.value}
                            </option>
                        {/each}
                    </select>
                {:else if field.type === "input"}
                    {@render Input(field)}
                {:else}
                    <p>--</p>
                {/if}
            </div>
        </div>
    {/each}
    <!-- Materials section -->
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
            {#if materialInfo?.colors && materialInfo.colors.length > 0}
                <div class="flex flex-col gap-1">
                    <p class="text-sm text-primary-500">Szín</p>
                    <div class="flex gap-1 flex-wrap">
                        {#each materialInfo?.colors || [] as color}
                            <Tooltip>
                                {#snippet content()}
                                    {color.label || color.color_id}
                                {/snippet}
                                <IconButton>
                                    <div
                                        class="size-4 border rounded-full hover:scale-115 transition-all"
                                        style={`background-color: ${color.hex}`}>
                                    </div>
                                </IconButton>
                            </Tooltip>
                        {/each}
                    </div>
                </div>
            {/if}
        {/if}
    {/if}
    <div class="w-full h-0.5 bg-border"></div>
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
            {#each priceParts as part, index}
                <div class="flex justify-between">
                    <p>{part.label}</p>
                    <p>
                        {part.price !== undefined ? `${index != 0 ? "+" : ""}${part.price} Ft` : "--"}
                        {#if product.priced_by_length}
                            /m
                        {/if}
                    </p>
                </div>
            {/each}
            <div class="w-full h-0.5 bg-border"></div>
            {#if product.priced_by_length}
                <div class="flex justify-between">
                    <p>Méterár</p>
                    <p>
                        {priceParts.reduce((sum, part) => sum + (part.price ?? 0), 0)} Ft
                        {#if product.priced_by_length}
                            /m
                        {/if}
                    </p>
                </div>
            {/if}
            {#if product.priced_by_length}
                {@const totalPrice = priceParts.reduce((sum, part) => sum + (part.price ?? 0), 0)}
                {@const length = product.fields.find((f) => f.length_based_pricing_source)?.value?.value
                    ? Number.parseFloat(product.fields.find((f) => f.length_based_pricing_source)!.value!.value) / 100
                    : 0}
                <div class="flex justify-between font-medium">
                    <p>Összesen</p>
                    <p>
                        {#if product.priced_by_length}
                            {#if Number.isNaN(length) || length <= 0}
                                --
                            {:else}
                                {totalPrice * length} Ft
                            {/if}
                        {:else}
                            {totalPrice} Ft
                        {/if}
                    </p>
                </div>
            {/if}
        </div>
    </div>
</div>
