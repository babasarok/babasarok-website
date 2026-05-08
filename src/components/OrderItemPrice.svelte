<script lang="ts">
    import Icon from "@iconify/svelte";
    import type { ProductItem, RadioField, SelectField } from "../../tina/products";
    import Tooltip from "./Tooltip.svelte";

    interface Props {
        product: ProductItem;
    }

    const { product }: Props = $props();

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
                case "color":
                case "select": {
                    const items = (field as RadioField | SelectField).items;
                    const selectedItem = items?.find((item) => item.value === field.value?.value);
                    priceParts.push({ label: field.label || field.name, price: selectedItem?.price });
                    break;
                }
                case "toggle": {
                    priceParts.push({
                        label: field.label || field.name,
                        price:
                            field.value?.value === undefined
                                ? undefined
                                : field.value?.value === "true"
                                  ? field.price
                                  : 0,
                    });
                    break;
                }
                default:
                    break;
            }
        }

        if (product.materials && product.materials.length > 0) {
            for (let i = 0; i < (product.material_required_count ?? 0); i++) {
                const material = product.materials?.[i];
                priceParts.push({
                    label: (product.material_required_count ?? 0) == 1 ? "Anyag" : `Anyag ${i + 1}`,
                    price: material.price,
                });
            }
        }
        return priceParts;
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
        <svelte:boundary>
            {@const totalPrice = Math.round(priceParts.reduce((sum, part) => sum + (part.price ?? 0), 0))}
            {@const length = product.fields.find((f) => f.length_based_pricing_source)?.value?.value
                ? Number.parseFloat(product.fields.find((f) => f.length_based_pricing_source)!.value!.value) / 100
                : 0}
            {@const finalPrice = product.priced_by_length
                ? Number.isNaN(length) || length <= 0
                    ? undefined
                    : totalPrice * length
                : totalPrice}
            <div class={["flex justify-between", { "font-medium": product.count === 1 }]}>
                <p>
                    {#if product.count === 1}
                        Összesen
                    {:else}
                        Darabár
                    {/if}
                </p>
                <p>
                    {finalPrice !== undefined ? `${finalPrice * product.count} Ft` : "--"}
                </p>
            </div>
            {#if product.count > 1}
                <div class="flex justify-between font-medium">
                    <p>Összesen</p>
                    <p>
                        {finalPrice !== undefined ? `${finalPrice * product.count} Ft` : "--"}
                    </p>
                </div>
            {/if}
        </svelte:boundary>
    </div>
</div>
