<svelte:options customElement={{ tag: "order-form", shadow: "none" }} />

<script module lang="ts">
    import Icon from "@iconify/svelte";
    import OrderItem from "./OrderItem.svelte";
    import { productValidator } from "../../tina/productTypes";
    import { materialValidator } from "../../tina/materialTypes";
    import { fade } from "svelte/transition";
    import IconButton from "./common/IconButton.svelte";
    import Button from "./common/Button.svelte";
    import type { TinaProductResolved, TinaResolvedMaterial } from "../lib/types.svelte";
    import z from "zod";
    import { isItemValid, nonEmptyObject, validateItem } from "../lib/validation";
    import { Product } from "../lib/Product.svelte";
    import { sanitizeItem } from "../lib/validation";
    import Masonry from "svelte-bricks";

    export const materialsResponseValidator = z.record(z.string(), materialValidator).transform((record) => {
        const result: Record<string, TinaResolvedMaterial> = {};
        for (const key in record) {
            const material = record[key];

            result[key] = {
                ...material,
                colors: material.colors?.filter((x) => nonEmptyObject(x)),
            };
        }
        return result;
    });

    export const productsResponseValidator = (materials: Record<string, TinaResolvedMaterial>) =>
        z.record(z.string(), productValidator).transform((record) => {
            const result: Record<string, TinaProductResolved> = {};
            for (const key in record) {
                const product = record[key];

                result[product.product_id] = {
                    ...product,
                    product_path: key,
                    materials: product.materials
                        ?.filter((x) => nonEmptyObject(x))
                        .map((material) => ({
                            ...material,
                            material: materials[material.material_path],
                        })),
                    fields: product.fields
                        ?.filter((x) => nonEmptyObject(x))
                        .map((field) => {
                            switch (field.type) {
                                case "input":
                                    return {
                                        ...field,
                                        type: "input",
                                        items: field.items?.filter((x) => nonEmptyObject(x)) ?? [],
                                    };
                                case "select":
                                    return {
                                        ...field,
                                        type: "select",
                                        items: field.items?.filter((x) => nonEmptyObject(x)) ?? [],
                                    };
                                case "radio":
                                    return {
                                        ...field,
                                        type: "radio",
                                        items: field.items?.filter((x) => nonEmptyObject(x)) ?? [],
                                    };
                                case "color":
                                    return {
                                        ...field,
                                        type: "color",
                                        items: field.items?.filter((x) => nonEmptyObject(x)) ?? [],
                                    };
                                case "toggle":
                                    return { ...field, type: "toggle" };
                            }
                        }),
                };
            }
            return result;
        });

    let productInfo: Record<string, TinaProductResolved> | null = $state(null);

    async function main() {
        const productResponse = await fetch("/json/product-data.json");
        const materialsResponse = await fetch("/json/material-data.json");
        const materialsResult = await materialsResponseValidator.safeParseAsync(await materialsResponse.json());
        if (!materialsResult.success) {
            console.error("Failed to parse materials data", materialsResult.error);
            return;
        }
        const productsResult = await productsResponseValidator(materialsResult.data).safeParseAsync(
            await productResponse.json()
        );
        if (!productsResult.success) {
            console.error("Failed to parse products data", productsResult.error);
            return;
        }

        productInfo = productsResult.data;
    }

    let products: Product[] = $state([]);
    let error = $state<string | null>(null);
    main();
</script>

<form
    class="flex flex-col"
    onsubmit={(e) => {
        e.preventDefault();
        error = null;
        for (const product of products) {
            validateItem(product);
        }

        for (const product of products) {
            if (!isItemValid(product)) {
                error = "Kérem, ellenőrizd a termékek adatait, és töltsd ki a hiányzó mezőket.";
                return;
            }
        }
    }}>
    <h3 class="mb-4">Árajánlatkérés</h3>
    <div class="flex flex-col gap-6">
        <div class="flex flex-col gap-4">
            <div class="flex items-center gap-2">
                <Icon icon="mdi:account" class="shrink-0 text-4xl rounded-full p-2 text-primary-500 bg-bg-primary" />
                <div class="flex flex-col gap-2 text-nowrap">
                    <h4>Vásárlói adatok</h4>
                </div>
            </div>
            <div class="flex gap-2 flex-col sm:flex-row">
                <input type="text" placeholder="Név *" required />
                <input type="email" placeholder="Email cím *" required />
                <input type="tel" placeholder="Telefonszám" />
            </div>
        </div>
        <div class="flex flex-col gap-4">
            <div class="flex items-center gap-2 justify-between">
                <div class="flex items-center gap-2">
                    <Icon icon="mdi:cart" class="shrink-0 text-4xl rounded-full p-2 text-primary-500 bg-bg-primary" />
                    <div class="flex flex-col gap">
                        <h4>Termék kiválasztása</h4>
                        <p class="text-sm">Válassz egy vagy több terméket, amire árajánlatot szeretnél kapni.</p>
                    </div>
                </div>
                <IconButton type="button" popovertarget="product-dialog">
                    <Icon icon="mdi:add" class="size-8" />
                </IconButton>
            </div>
            <dialog
                class="h-[80%] w-[80%] md:w-fit md:h-fit md:max-h-[80%] m-auto border-0 rounded-2xl shadow-lg"
                id="product-dialog"
                popover>
                <div class="flex flex-col gap-4 h-full py-4">
                    <div class="flex items-center justify-between gap-2 px-4">
                        <div class="flex items-center gap-2">
                            <Icon
                                icon="mdi:cart"
                                class="shrink-0 text-4xl rounded-full p-2 text-primary-500 bg-bg-primary" />
                            <div class="flex flex-col gap">
                                <h4>Termékek</h4>
                            </div>
                        </div>
                        <IconButton type="button" popovertarget="product-dialog" popovertargetaction="hide">
                            <Icon icon="mdi:close" />
                        </IconButton>
                    </div>
                    <div class="flex-1 overflow-auto flex flex-col gap-2">
                        {#each Object.values(productInfo || {}) as product}
                            {@const addedCount = products.reduce(
                                (count, p) => (p.name === product.name ? count + 1 : count),
                                0
                            )}
                            <button
                                type="button"
                                class="flex font-normal w-full justify-between items-center gap-4 p-1 px-4 rounded hover:bg-border transition-all"
                                onclick={() => {
                                    const snapshot = $state.snapshot(product);
                                    products.splice(0, 0, sanitizeItem(new Product(snapshot)));
                                }}>
                                <div class="flex flex-col text-start">
                                    {product.name}{addedCount > 0 ? ` (${addedCount})` : ""}
                                </div>
                                <Icon icon="mdi:add" class="shrink-0" />
                            </button>
                        {/each}
                    </div>
                </div>
            </dialog>
            <Masonry items={products} getId={(item) => item.uuid} gap={16} order="column-sequential" animate={false}>
                {#snippet children({ item })}
                    <div transition:fade={{ duration: 250 }}>
                        <OrderItem
                            product={item}
                            onClose={() => {
                                const index = products.findIndex((p) => p.uuid === item.uuid);
                                if (index !== -1) {
                                    products.splice(index, 1);
                                }
                            }}
                            onChange={(updatedProduct) => {
                                const index = products.findIndex((p) => p.uuid === updatedProduct.uuid);
                                if (index !== -1) {
                                    ((products[index] = sanitizeItem(updatedProduct)), false);
                                }
                            }} />
                    </div>
                {/snippet}
            </Masonry>
        </div>
        <Button variant="contained" type="submit">Árajánlat kérése</Button>
    </div>
</form>

<style>
    dialog::backdrop {
        background: rgba(0, 0, 0, 0.5);
    }
</style>
