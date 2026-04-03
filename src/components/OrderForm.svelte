<svelte:options customElement={{ tag: "order-form", shadow: "none" }} />

<script module lang="ts">
    import Icon from "@iconify/svelte";
    import OrderItem from "./OrderItem.svelte";
    import type { Product } from "../products";

    let productSelectValue: string = $state("");
    let products: Product[] = $state([
        {
            id: "racsvedo",
            colors: [],
            size: undefined,
            material: undefined,
            fonas: undefined,
        },
    ]);
</script>

<form class="flex flex-col">
    <h3 class="mb-4">Árajánlatkérés</h3>
    <div class="flex flex-col gap-6">
        <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2">
                <Icon icon="mdi:account" class="shrink-0 text-4xl rounded-full p-2 text-primary bg-bg-primary" />
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
                <Icon icon="mdi:cart" class="shrink-0 text-4xl rounded-full p-2 text-primary bg-bg-primary" />
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
                    <option value="racsvedo">Fonott Racsvedo</option>
                    <option value="babafeszek">Babafeszek</option>
                    <option value="baldachin">Baldachin</option>
                    <option value="polya">Polya</option>
                    <option value="babatakaro_szett">Babatakaro Szett</option>
                    <option value="feher_gumis_lepedo">Feher gumis lepedo</option>
                    <option value="kanikulatakaro">Kanikulatakaro</option>
                    <option value="gezpelenka_szett">Gezpelenka szett</option>
                    <option value="meleg_wellsoft_takaro">Meleg wellsoft takaro</option>
                    <option value="kismamaparna">Kismamaparna, pamutvaszon huzattal</option>
                    <option value="diszparna">Diszparna</option>
                    <option value="meleg_wellsoft_takaro">Zsebes tarolo</option>
                </select>
                <button
                    disabled={!productSelectValue}
                    onclick={() => {
                        switch (productSelectValue) {
                            case "racsvedo": {
                                products.push({
                                    colors: [],
                                    fonas: undefined,
                                    material: undefined,
                                    size: undefined,
                                    id: "racsvedo",
                                });
                                break;
                            }
                        }
                        productSelectValue = "";
                    }}>
                    <Icon icon="mdi:plus" class="text-2xl text-primary hover:text-primary-light" />
                </button>
            </div>
            <div class="flex gap-2">
                {#each products as product}
                    <OrderItem {product} onClose={() => {}} />
                {/each}
            </div>
        </div>
    </div>
</form>
