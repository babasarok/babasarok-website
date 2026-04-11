<svelte:options customElement={{ tag: "order-form", shadow: "none" }} />

<script module lang="ts">
    import Icon from "@iconify/svelte";
    import OrderItem from "./OrderItem.svelte";
    import type { Product, ProductItem } from "../../tina/products";
    import type { Material } from "../../tina/materials";
    import { v4 as uuidv4 } from "uuid";
    import { flip } from "svelte/animate";
    import { fade } from "svelte/transition";
    import IconButton from "./IconButton.svelte";
    import Button from "./Button.svelte";

    let productInfo: Record<string, Product> | null = $state(null);
    let materialInfo: Record<string, Material> | null = $state(null);

    async function main() {
        const productResponse = await fetch("/json/product-data.json");
        const materialsResponse = await fetch("/json/material-data.json");
        productInfo = await productResponse.json();
        materialInfo = await materialsResponse.json();
    }

    let productSelectValue: string = $state("");
    let products: ProductItem[] = $state([]);

    const valid = $derived.by(() => {
        if (!products.length) {
            return false;
        }

        for (const product of products) {
            if (product.materials && product.materials.length > 0) {
                if (!product.material_value || !product.material_value.material_id) {
                    return false;
                }

                const material = materialInfo
                    ? Object.values(materialInfo).find((m) => m.material_id === product.material_value?.material_id)
                    : null;
                if (!material) {
                    return false;
                }

                // TODO: validate color count
            }

            for (const field of product.fields) {
                if (!field.value) {
                    return false;
                }
            }
        }

        return true;
    });

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

                        products.push({ ...$state.snapshot(currentProduct), uuid: uuidv4() });
                        productSelectValue = "";
                    }}>
                    <Icon icon="mdi:plus" />
                </IconButton>
            </div>
            <div class="grid gap-2 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {#each products as product (`${product.uuid}`)}
                    {@const info = productInfo?.[product.product_id]}
                    <div transition:fade={{ duration: 250 }} animate:flip={{ duration: 250 }}>
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
        <Button disabled={!valid} variant="contained" type="submit">Árajánlat kérése</Button>
    </div>
</form>
