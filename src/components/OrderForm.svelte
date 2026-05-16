<svelte:options customElement={{ tag: "order-form", shadow: "none" }} />

<script module lang="ts">
    import Icon from "@iconify/svelte";
    import OrderItem from "./OrderItem.svelte";
    import { productValidator } from "../../tina/productTypes";
    import { materialValidator } from "../../tina/materialTypes";
    import { v4 as uuidv4 } from "uuid";
    import { fade } from "svelte/transition";
    import IconButton from "./IconButton.svelte";
    import Button from "./Button.svelte";
    import { nonEmptyObject, type ProductItem, type ProductResolved, type ResolvedMaterial } from "../lib/types";
    import z from "zod";

    export const materialsResponseValidator = z.record(z.string(), materialValidator).transform((record) => {
        const result: Record<string, ResolvedMaterial> = {};
        for (const key in record) {
            const material = record[key];

            result[key] = {
                ...material,
                colors: material.colors?.filter((x) => nonEmptyObject(x)),
            };
        }
        return result;
    });

    export const productsResponseValidator = (materials: Record<string, ResolvedMaterial>) =>
        z.record(z.string(), productValidator).transform((record) => {
            const result: Record<string, ProductResolved> = {};
            for (const key in record) {
                const product = record[key];

                result[key] = {
                    ...product,
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

    let productInfo: Record<string, ProductResolved> | null = $state(null);
    let materialInfo: Record<string, ResolvedMaterial> | null = $state(null);

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

        materialInfo = materialsResult.data;
        productInfo = productsResult.data;
    }

    let productSelectValue: string = $state("");
    let products: ProductItem[] = $state([]);
    main();
</script>

<form class="flex flex-col">
    <h3 class="mb-4">Árajánlatkérés</h3>
    <div class="flex flex-col gap-6">
        <div class="flex flex-col gap-4">
            <div class="flex items-center gap-2">
                <Icon icon="mdi:account" class="shrink-0 text-4xl rounded-full p-2 text-primary-500 bg-bg-primary" />
                <div class="flex flex-col gap-2 text-nowrap">
                    <h4>Vásárlói adatok</h4>
                </div>
            </div>
            <div class="flex gap-2">
                <input type="text" placeholder="Név *" required />
                <input type="email" placeholder="Email cím *" required />
                <input type="tel" placeholder="Telefonszám" />
            </div>
        </div>
        <div class="flex flex-col gap-4">
            <div class="flex items-center gap-2">
                <Icon icon="mdi:cart" class="shrink-0 text-4xl rounded-full p-2 text-primary-500 bg-bg-primary" />
                <div class="flex flex-col gap">
                    <h4>Termék kiválasztása</h4>
                    <p class="text-sm">Válassz egy vagy több terméket, amire árajánlatot szeretnél kapni.</p>
                </div>
            </div>
            <div class="flex gap-2">
                <select
                    required
                    value={productSelectValue}
                    onchange={(e) => {
                        if (!(e.target instanceof HTMLSelectElement)) {
                            return;
                        }

                        productSelectValue = e.target.value;
                    }}>
                    <option value="" disabled selected>Válassz egy terméket</option>
                    {#each Object.values(productInfo || {}) as product}
                        <option value={product.product_id}>{product.name}</option>
                    {/each}
                </select>
                <IconButton
                    type="button"
                    disabled={!productSelectValue}
                    onclick={() => {
                        const currentProduct = productInfo?.[productSelectValue];
                        if (!currentProduct) {
                            return;
                        }

                        products.push({ ...$state.snapshot(currentProduct), uuid: uuidv4(), count: 1 });
                        productSelectValue = "";
                    }}>
                    <Icon icon="mdi:plus" />
                </IconButton>
            </div>
            <div class="grid gap-2 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {#each products as product (`${product.uuid}`)}
                    {@const info = productInfo?.[product.product_id]}
                    <div transition:fade={{ duration: 250 }}>
                        {#if info}
                            <OrderItem
                                {product}
                                materials={materialInfo}
                                onClose={() => {
                                    const index = products.findIndex((p) => p.uuid === product.uuid);
                                    if (index !== -1) {
                                        products.splice(index, 1);
                                    }
                                }}
                                onChange={(updatedProduct) => {
                                    const index = products.findIndex((p) => p.uuid === updatedProduct.uuid);
                                    if (index !== -1) {
                                        products[index] = updatedProduct;
                                    }
                                }} />
                        {/if}
                    </div>
                {/each}
            </div>
        </div>
        <Button variant="contained" type="submit">Árajánlat kérése</Button>
    </div>
</form>
