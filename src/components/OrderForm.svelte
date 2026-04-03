<svelte:options customElement={{ tag: "order-form", shadow: "none" }} />

<script module lang="ts">
    import Icon from "@iconify/svelte";
    import OrderItem from "./OrderItem.svelte";
    import type { Product } from "../../tina/products";

    import IconButton from "./IconButton.svelte";

    let productInfo: Record<string, Product> | null = $state(null);

    async function main() {
        const response = await fetch("/json/product-data.json");
        productInfo = await response.json();
    }

    let productSelectValue: string = $state("");
    let products: Product[] = $state([]);

    main();
</script>

<form class="flex flex-col">
    <h3 class="mb-4">Árajánlatkérés</h3>
    <div class="flex flex-col gap-6">
        <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
                <Icon icon="mdi:account" class="shrink-0 text-4xl rounded-full p-2 text-primary-500 bg-bg-primary" />
                <div class="flex flex-col gap-2 text-nowrap">
                    <h4>Vasarloi adatok</h4>
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
                        <option value={product.id}>{product.name}</option>
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

                        products.push($state.snapshot(currentProduct));
                        productSelectValue = "";
                    }}>
                    <Icon icon="mdi:plus" />
                </IconButton>
            </div>
            <div class="grid gap-2 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {#each products as product}
                    {@const info = productInfo?.[product.id]}
                    {#if info}
                        <OrderItem
                            {product}
                            onClose={() => {
                                const index = products.findIndex((p) => p.id === product.id);
                                if (index !== -1) {
                                    products.splice(index, 1);
                                }
                            }} />
                    {/if}
                {/each}
            </div>
        </div>
    </div>
    <button type="submit">Árajánlat kérése</button>
</form>
