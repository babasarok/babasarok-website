<svelte:options customElement={{ tag: "order-form", shadow: "none" }} />

<script module lang="ts">
    import Icon from "@iconify/svelte";
    import OrderItem from "./OrderItem.svelte";
    import { productValidator } from "../../tina/productTypes";
    import { materialValidator } from "../../tina/materialTypes";
    import { fade } from "svelte/transition";
    import IconButton from "./common/IconButton.svelte";
    import Button from "./common/Button.svelte";
    import type { TinaDeliveryMethodResolved, TinaProductResolved, TinaResolvedMaterial } from "../lib/types.svelte";
    import z from "zod";
    import { isItemValid, nonEmptyObject, validateItem } from "../lib/validation";
    import { Product } from "../lib/Product.svelte";
    import { sanitizeItem } from "../lib/validation";
    import Masonry from "svelte-bricks";
    import { generateFormData } from "../lib/emailConverter";
    import { deliveryMethodValidator } from "../../tina/deliveryMethodTypes";
    import OrderDelivery from "./OrderDelivery.svelte";

    export const deliveryMethodsResponseValidator = z
        .object({ pages: z.array(deliveryMethodValidator.extend({ path: z.string() })) })
        .transform((obj) => {
            const result: Record<string, TinaDeliveryMethodResolved> = {};
            for (const page of obj.pages) {
                result[page.delivery_name] = {
                    ...page,
                    delivery_path: page.path,
                };
            }
            return result;
        });

    export const materialsResponseValidator = z
        .object({ pages: z.array(materialValidator.extend({ path: z.string() })) })
        .transform((obj) => {
            const result: Record<string, TinaResolvedMaterial> = {};
            for (const page of obj.pages) {
                result[page.path] = {
                    ...page,
                    colors: page.colors?.filter((x) => nonEmptyObject(x)) ?? [],
                };
            }
            return result;
        });

    export const productsResponseValidator = (materials: Record<string, TinaResolvedMaterial>) =>
        z
            .object({
                pages: z.array(productValidator.extend({ path: z.string(), can_be_ordered: z.boolean().optional() })),
            })
            .transform((obj) => {
                const result: Record<string, TinaProductResolved> = {};
                for (const page of obj.pages) {
                    if (!page.can_be_ordered) {
                        continue;
                    }
                    result[page.product_id] = {
                        ...page,
                        product_path: page.path,
                        materials:
                            page.materials
                                ?.filter((x) => nonEmptyObject(x))
                                .map((material) => ({
                                    ...material,
                                    material: materials[material.material_path],
                                })) ?? [],
                        fields:
                            page.fields
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
                                }) ?? [],
                    };
                }
                return result;
            });

    let productInfo: Record<string, TinaProductResolved> | null = $state(null);
    let deliveryMethods: Record<string, TinaDeliveryMethodResolved> | null = $state(null);

    async function main() {
        const productResponse = await fetch("/product/index.json");
        const materialsResponse = await fetch("/material/index.json");
        const deliveryMethodsResponse = await fetch("/delivery_method/index.json");
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

        const deliveryMethodsResult = await deliveryMethodsResponseValidator.safeParseAsync(
            await deliveryMethodsResponse.json()
        );
        if (!deliveryMethodsResult.success) {
            console.error("Failed to parse delivery methods data", deliveryMethodsResult.error);
            return;
        }

        productInfo = productsResult.data;
        deliveryMethods = deliveryMethodsResult.data;
        deliveryMethod = Object.values(deliveryMethods)[0]?.delivery_name ?? "";
    }

    let products: Product[] = $state([]);
    let error: string | null = $state(null);
    let success: string | null = $state(null);
    let name = $state("");
    let email = $state("");
    let phone = $state("");
    let deliveryMethod = $state<string>("");
    let message = $state("");

    let valid = $derived.by(() => {
        if (products.length === 0) return false;
        if (name.trim() === "" || email.trim() === "") return false;

        return true;
    });
    main();
    let sending = $state(false);
</script>

<form
    class="flex flex-col"
    onsubmit={async (e) => {
        e.preventDefault();
        error = null;
        success = null;
        for (const product of products) {
            validateItem(product);
        }

        for (const product of products) {
            if (!isItemValid(product)) {
                error = "Kérem, ellenőrizd a termékek adatait, és töltsd ki a hiányzó mezőket.";
                return;
            }
        }

        const deliveryMethodData = deliveryMethods?.[deliveryMethod];
        if (!deliveryMethodData) {
            error = "Kérem, válassz egy szállítási módot.";
            return;
        }

        // const captcha = e.currentTarget.querySelector("textarea[name=h-captcha-response]");
        // if (
        //     !captcha ||
        //     "value" in captcha === false ||
        //     typeof captcha.value !== "string" ||
        //     captcha.value.trim() === ""
        // ) {
        //     error = "Kérem, erősítsd meg, hogy nem vagy robot.";
        //     return;
        // }

        const serializedData = generateFormData(name, email, phone, deliveryMethodData, products);
        const formData = new FormData();
        const productStrings = serializedData.termékek.map((p) => {
            let result = p.név;
            result += ` (${p.darabszám}db)`;
            result += `\n`;
            if (p.opciók && p.opciók.length > 0) {
                for (const option of p.opciók ?? []) {
                    result += `  ${option.név}: ${option.érték}\n`;
                }
            }
            if (p.anyagok && p.anyagok.length > 0) {
                result += `  Anyagok:\n`;

                for (const material of p.anyagok ?? []) {
                    result += `    - ${material.név} (${material.egyedi_szín ?? material.színek?.join(", ")})\n`;
                }
            }

            result += "\n";
            result += `Alapár: ${p.ár.alapár} Ft\n`;
            if (p.ár.tételek && p.ár.tételek.length > 0) {
                for (const tétel of p.ár.tételek) {
                    result += `${tétel.tétel}: ${tétel.ár ?? "??"}Ft \n`;
                }
            }
            result += "\n";
            result += `${p.ár.egységár ? `  Egységár: ${p.ár.egységár}Ft` : ""}\n`;
            if (p.ár.hossz_alapú) {
                result += `  Méterár: ${p.ár.méterár}Ft/m\n`;
            }
            result += `Összár: ${p.ár.összár}Ft ${p.ár.nem_teljes_ár ? "(nem teljes ár)" : ""}`;

            return result;
        });
        // formData.append("h-captcha-response", captcha.value);
        formData.append("access_key", "1ffa9477-1db3-47f2-bc9e-1226e3a3b858");
        formData.append("subject", `Új árajánlatkérés - ${serializedData.név}`);
        formData.append("nev", serializedData.név);
        formData.append("email", serializedData.email);
        formData.append("telefonszam", serializedData.telefonszám);
        for (const [index, productString] of productStrings.entries()) {
            formData.append(`termek ${index + 1}`, productString);
        }

        formData.append(
            "szallitasimod",
            `${serializedData.szállítási_mód.név} (${serializedData.szállítási_mód.ár} Ft)`
        );
        formData.append("uzenet", message);
        formData.append(
            "ar",
            `${serializedData.ár.összár} Ft ${serializedData.ár.nem_teljes_ár ? "(nem teljes ár)" : ""}`
        );
        sending = true;
        try {
            const res = await fetch("https://api.web3forms.com/submit", {
                method: "POST",
                body: formData,
            });

            const result = await res.json();

            if (!res.ok) {
                error = `Hiba történt az árajánlatkérés elküldése közben. Kérlek, próbáld meg újra később. (${result.message})`;
                console.log("Failed to submit order", result);
                sending = false;
                return;
            }
        } catch (e) {
            error = `Hiba történt az árajánlatkérés elküldése közben. Kérlek, próbáld meg újra később.`;
            console.log("Failed to submit order", e);
            sending = false;
            return;
        }

        sending = false;
        success = "Árajánlatkérésed sikeresen elküldve! Hamarosan felvesszük veled a kapcsolatot.";
        products = [];
    }}>
    <h3 class="mb-4">Árajánlatkérés</h3>
    <div class="flex flex-col">
        <div class="flex flex-col gap-4 pb-6">
            <div class="flex items-center gap-2">
                <Icon icon="mdi:account" class="shrink-0 text-4xl rounded-full p-2 text-primary-500 bg-bg-primary" />
                <div class="flex flex-col gap-2 text-nowrap">
                    <h4 class="text-xl text-uppercase">Vásárlói adatok</h4>
                </div>
            </div>
            <div class="flex gap-2 flex-col sm:flex-row">
                <input type="text" placeholder="Név *" required bind:value={name} />
                <input type="email" placeholder="Email cím *" required bind:value={email} />
                <input type="tel" placeholder="Telefonszám" bind:value={phone} />
            </div>
        </div>
        <div class="flex flex-col gap-4">
            <div class="flex items-center gap-2 justify-between">
                <div class="flex items-center gap-2">
                    <Icon icon="mdi:cart" class="shrink-0 text-4xl rounded-full p-2 text-primary-500 bg-bg-primary" />
                    <div class="flex flex-col gap">
                        <h4 class="text-xl text-uppercase">Termék kiválasztása</h4>
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
                                <h4 class="text-xl text-uppercase">Termékek</h4>
                            </div>
                        </div>
                        <IconButton type="button" popovertarget="product-dialog" popovertargetaction="hide">
                            <Icon icon="mdi:close" />
                        </IconButton>
                    </div>
                    <div class="flex-1 overflow-auto flex flex-col gap-2">
                        {#each Object.values(productInfo || {}).sort( (a, b) => a.title.localeCompare(b.title) ) as product}
                            {@const addedCount = products.reduce(
                                (count, p) => (p.title === product.title ? count + 1 : count),
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
                                    {product.title}{addedCount > 0 ? ` (${addedCount})` : ""}
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
        <div class="w-full h-0.5 bg-border mt-4"></div>
        <div class="flex gap-4 flex-wrap mt-6 relative">
            <OrderDelivery {deliveryMethods} bind:deliveryMethod />
            <div class="flex flex-col rounded-xl bg-border p-4 flex-1">
                <div class="flex items-center gap-2">
                    <Icon icon="mdi:message-text" class="shrink-0 text-2xl  text-primary-500" />
                    <h4 class="text-xl text-uppercase">Egyéb információ</h4>
                </div>
                <textarea bind:value={message} placeholder="Megjegyzés a rendeléshez" class="mt-4 flex-1 text-sm"
                ></textarea>
            </div>
        </div>
        <div class="flex flex-col gap-2 mt-4"></div>
        <!-- <div class="h-captcha mt-4" data-captcha="true"></div> -->
        {#if success}
            <p class="pt-4 text-sm text-green-500">{success}</p>
        {/if}
        {#if error}
            <p class="pt-4 text-sm text-red-500">{error}</p>
        {/if}
        <Button class="mt-4" variant="contained" type="submit" disabled={!valid || sending}>Árajánlat kérése</Button>
    </div>
</form>

<style>
    dialog::backdrop {
        background: rgba(0, 0, 0, 0.5);
    }
</style>
