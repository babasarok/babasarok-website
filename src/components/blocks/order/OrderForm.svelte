<script lang="ts">
  import Icon from "@iconify/svelte";
  import OrderItem from "./OrderItem.svelte";
  import { fade } from "svelte/transition";
  import { untrack } from "svelte";
  import { onMount } from "svelte";
  import IconButton from "./common/IconButton.svelte";
  import Button from "./common/Button.svelte";
  import TextInput from "./common/TextInput.svelte";
  import { isItemValid, validateItem } from "@/lib/validation";
  import { sanitizeItem } from "@/lib/validation";
  import Masonry from "svelte-bricks";
  import { submitOrder, calculateOrderTotal } from "@/lib/orderSubmit";
  import { resolveSetDiscount, resolveSetDiscountStatus } from "@/lib/priceUtils";
  import type { SetDiscountStatus } from "@/lib/priceUtils";
  import { loadOrderState, saveOrderState } from "@/lib/orderStorage";
  import {
    instantiateProduct,
    instantiateRelatedProduct,
    restoreProducts,
    syncMaterialsToPartner,
  } from "@/lib/orderProduct";
  import OrderDelivery from "./OrderDelivery.svelte";
  import type {
    CmsEnhancedEmbroideryColor,
    CmsEnhancedDeliveryMethod,
    CmsEnhancedProduct,
    CmsEnhancedConfig,
    CmsProductGroup,
  } from "@/lib/data";
  import type { IProduct } from "@/lib/types.svelte";

  interface Props {
    products: Record<string, CmsEnhancedProduct>;
    deliveryMethods: Record<string, CmsEnhancedDeliveryMethod>;
    // Only the form endpoint and support address are needed; passing the full
    // config would serialize the heavyweight logo images into the island props
    // (and breaks hydration).
    config: Pick<CmsEnhancedConfig, "fabformURL" | "address">;
    threadColors: CmsEnhancedEmbroideryColor[];
    productGroups: CmsProductGroup[];
  }

  let {
    products: productInfo,
    deliveryMethods,
    config: params,
    threadColors,
    productGroups,
  }: Props = $props();

  const savedState = loadOrderState();

  let error: string | null = $state(null);
  let success: string | null = $state(null);
  let name = $state(savedState?.name ?? "");
  let email = $state(savedState?.email ?? "");
  let phone = $state(savedState?.phone ?? "");
  let deliveryMethod = $state<string>(savedState?.deliveryMethod ?? "");
  let address = $state<string>(savedState?.address ?? "");
  let message = $state(savedState?.message ?? "");
  let products = $state<IProduct[]>(
    savedState
      ? untrack(() => restoreProducts(savedState.products, $state.snapshot(productInfo)))
      : []
  );

  // For each product, the catalog entries of its group siblings (de-duplicated
  // across all groups it belongs to). Drives the "add related" buttons per card.
  const relatedByProductId = $derived.by(() => {
    const map: Record<string, CmsEnhancedProduct[]> = {};
    for (const group of productGroups) {
      for (const { product_id: id } of group.products) {
        const siblings = (map[id] ??= []);
        for (const { product_id: otherId } of group.products) {
          if (
            otherId === id ||
            !Object.hasOwn(productInfo, otherId) ||
            siblings.some((p) => p.product_id === otherId)
          ) {
            continue;
          }
          siblings.push(productInfo[otherId]);
        }
      }
    }
    return map;
  });

  // Best set discount percent per product (biggest wins across all its sets).
  // This is the *potential* discount a product could unlock, used to annotate
  // the "add related" chips regardless of what's currently in the basket.
  const discountByProductId = $derived.by(() => {
    const map: Record<string, number> = {};
    for (const product of Object.values(productInfo)) {
      const best = resolveSetDiscount(product.product_id, productGroups);
      if (best) {
        map[product.product_id] = best.percent;
      }
    }
    return map;
  });

  // The set-discount state of each basket item relative to the current basket:
  // active (earned), pending-partner (no set sibling yet) or pending-material (a
  // sibling is present but its materials differ). Keyed by item uuid, because
  // two rows of the same product can differ in their material selections. Drives
  // the per-card price, discount label and set-completion nudge.
  const setStatusByUuid = $derived.by(() => {
    const basket = products;
    const map: Record<string, SetDiscountStatus | undefined> = {};
    for (const item of basket) {
      const status = resolveSetDiscountStatus(item, basket, productGroups);
      if (status) {
        map[item.uuid] = status;
      }
    }
    return map;
  });

  // How many basket items share each product_id, so the "add related" chips can
  // show that a suggested set piece is already in the basket (while staying
  // clickable to add more).
  const basketCountByProductId = $derived.by(() => {
    const map: Record<string, number> = {};
    for (const item of products) {
      map[item.product_id] = (map[item.product_id] ?? 0) + 1;
    }
    return map;
  });

  $effect(() => {
    saveOrderState({
      name,
      email,
      phone,
      deliveryMethod,
      address,
      message,
      products: $state.snapshot(products),
    });
  });

  let valid = $derived.by(() => {
    if (products.length === 0) {
      return false;
    }
    if (name.trim() === "" || email.trim() === "") {
      return false;
    }

    return true;
  });

  let sending = $state(false);

  // svelte-bricks lays out with JS, so it renders empty/janky until the island
  // hydrates; show a skeleton in its place until then.
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
  });

  // Native modal <dialog> instead of [popover]: iOS Safari mispositions popovers
  // (renders at document top, outside the viewport) and never scroll-locks the page.
  let productDialog: HTMLDialogElement;
  let productDialogOpen = $state(false);

  function openProductDialog(): void {
    productDialog.showModal();
    productDialogOpen = true;
  }

  function closeProductDialog(): void {
    productDialog.close();
  }

  $effect(() => {
    document.body.style.overflow = productDialogOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  });
</script>

<form
  class="flex flex-col px-3.75 sm:max-w-135 md:max-w-180 lg:max-w-240 xl:max-w-285 mx-auto text-body"
  onsubmit={async (e) => {
    e.preventDefault();
    error = null;
    success = null;
    for (const product of products) {
      validateItem(product);
    }

    if (products.some((product) => !isItemValid(product))) {
      error = "Kérem, ellenőrizd a termékek adatait, és töltsd ki a hiányzó mezőket.";
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const deliveryMethodData = deliveryMethods?.[deliveryMethod];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!deliveryMethodData) {
      error = "Kérem, válassz egy szállítási módot.";
      return;
    }

    if (deliveryMethodData.needs_address && address.trim() === "") {
      error = "Kérem, add meg a szállítási címet a szállítási módhoz.";
      return;
    }

    sending = true;
    const result = await submitOrder(
      {
        name,
        email,
        phone,
        deliveryMethod: deliveryMethodData,
        address,
        products,
        threadColors,
        productGroups,
      },
      {
        accessKey: params.fabformURL ?? "",
        message,
      }
    );
    sending = false;

    if (!result.ok) {
      error = result.message;
      return;
    }

    success = "Árajánlatkérésed sikeresen elküldve! Hamarosan felvesszük veled a kapcsolatot.";

    if (globalThis.window.fbq) {
      try {
        globalThis.window.fbq("track", "Purchase", {
          currency: "HUF",
          value: calculateOrderTotal(products, deliveryMethodData, productGroups).total,
          num_items: products.length,
        });
      } catch (e) {
        console.error("Failed to record purchase", e);
      }
    }

    products = [];
  }}
>
  <h3 class="text-h3 mb-4">Tervezzük meg a szettet!</h3>
  <div class="flex flex-col">
    <div class="flex flex-col gap-4 pb-6">
      <div class="flex items-center gap-2">
        <Icon
          icon="mdi:account"
          class="shrink-0 text-4xl rounded-full p-2 text-brown-500 bg-brown-50"
        />
        <div class="flex flex-col gap-2">
          <h4 class="text-lg uppercase">Hova küldhetjük a terveket?</h4>
        </div>
      </div>
      <div class="flex gap-2 flex-col sm:flex-row">
        <TextInput type="text" placeholder="Név *" required bind:value={name} />
        <TextInput type="email" placeholder="Email cím *" required bind:value={email} />
        <TextInput type="tel" placeholder="Telefonszám" bind:value={phone} />
      </div>
    </div>
    <div class="flex flex-col gap-4">
      <div class="flex items-center gap-2">
        <Icon
          icon="mdi:cart"
          class="shrink-0 text-4xl rounded-full p-2 text-brown-500 bg-brown-50"
        />
        <div class="flex flex-col gap">
          <h4 class="text-lg uppercase">Miket szeretnél a csomagba?</h4>
          <p class="text-sm">
            Kattints a gombra, és válaszd ki azokat a darabokat, amikből összeállítjuk a szettet.
          </p>
        </div>
      </div>
      <dialog
        class="fixed inset-0 h-[80%] w-[80%] md:w-fit md:h-fit md:max-h-[80%] m-auto border-0 rounded-2xl shadow-lg overflow-hidden open:flex flex-col"
        bind:this={productDialog}
        onclose={() => (productDialogOpen = false)}
      >
        <div class="flex flex-col gap-4 min-h-0 flex-1 py-4">
          <div class="flex items-center justify-between gap-2 px-4">
            <div class="flex items-center gap-2">
              <Icon
                icon="mdi:cart"
                class="shrink-0 text-4xl rounded-full p-2 text-brown-500 bg-brown-50"
              />
              <div class="flex flex-col gap">
                <h4 class="text-xl uppercase">Termékek</h4>
              </div>
            </div>
            <IconButton type="button" onclick={closeProductDialog}>
              <Icon icon="mdi:close" />
            </IconButton>
          </div>
          <div class="flex-1 min-h-0 overflow-auto overscroll-contain flex flex-col gap-2">
            {#each Object.values(productInfo).toSorted( (a, b) => a.title.localeCompare(b.title) ) as product (product.product_id)}
              {@const addedCount = products.reduce(
                (count, p) => (p.title === product.title ? count + 1 : count),
                0
              )}
              <button
                type="button"
                class="flex font-normal w-full justify-between items-center gap-4 p-1 px-4 rounded hover:bg-brown-200 transition-all cursor-pointer"
                onclick={() => {
                  products.push(instantiateProduct($state.snapshot(product)));
                }}
              >
                <div class="flex flex-col text-start">
                  {product.title}{addedCount > 0 ? ` (${addedCount.toString()})` : ""}
                </div>
                <Icon icon="mdi:add" class="shrink-0" />
              </button>
            {/each}
          </div>
        </div>
      </dialog>
      {#if mounted}
        <Masonry
          items={[...products, { uuid: "placeholder", placeholder: true }]}
          getId={(item) => item.uuid}
          gap={16}
          order="column-sequential"
          animate={false}
          columnStyle="grid-template-columns: minmax(0, 1fr)"
        >
          {#snippet children({ item })}
            {#if "placeholder" in item && item.placeholder}
              <button
                disabled={import.meta.env.SSR}
                class="flex flex-col w-full h-full items-center justify-center text-lg min-h-48 p-7 rounded-xl border border-brown-200 text-brown-500 font-semibold hover:bg-brown-100 transition-all cursor-pointer gap-2"
                type="button"
                onclick={openProductDialog}
              >
                Kattints ide, és válassz termékeket!
                <Icon icon="mdi:add" class="shrink-0 text-4xl" />
              </button>
            {:else}
              {@const setStatus = setStatusByUuid[(item as IProduct).uuid]}
              <div transition:fade={{ duration: 250 }}>
                <OrderItem
                  product={item as IProduct}
                  {threadColors}
                  {setStatus}
                  setDiscountPercent={setStatus?.state === "active" ? setStatus.percent : undefined}
                  {basketCountByProductId}
                  relatedDiscounts={discountByProductId}
                  relatedProducts={relatedByProductId[(item as IProduct).product_id] ?? []}
                  onAddRelated={(target) => {
                    products.push(
                      instantiateRelatedProduct(
                        $state.snapshot(target),
                        $state.snapshot(item as IProduct)
                      )
                    );
                  }}
                  onSyncToSet={() => {
                    if (setStatus?.state !== "pending-material") {
                      return;
                    }
                    const index = products.findIndex((p) => p.uuid === item.uuid);
                    const partner = products.find((p) => p.uuid === setStatus.partnerUuid);
                    if (index === -1 || !partner) {
                      return;
                    }
                    products[index] = syncMaterialsToPartner(
                      $state.snapshot(products[index]),
                      $state.snapshot(partner)
                    );
                  }}
                  onClose={() => {
                    const index = products.findIndex((p) => p.uuid === item.uuid);
                    if (index !== -1) {
                      products.splice(index, 1);
                    }
                  }}
                  onChange={(updatedProduct) => {
                    const index = products.findIndex((p) => p.uuid === updatedProduct.uuid);
                    if (index !== -1) {
                      products[index] = sanitizeItem(updatedProduct);
                    }
                  }}
                />
              </div>
            {/if}
          {/snippet}
        </Masonry>
      {:else}
        <div
          class="min-h-48 mx-auto w-full max-w-125 animate-pulse rounded-xl border border-brown-200 bg-brown-100"
          aria-hidden="true"
        ></div>
      {/if}
    </div>
    <div class="w-full h-0.5 bg-brown-200 mt-4"></div>
    <div class="flex gap-4 flex-wrap mt-6 relative">
      <OrderDelivery {deliveryMethods} bind:deliveryMethod bind:address />
      <div class="flex flex-col rounded-xl bg-brown-200 p-4 flex-1">
        <div class="flex items-center gap-2">
          <Icon icon="mdi:message-text" class="shrink-0 text-2xl  text-brown-500" />
          <h4 class="text-lg uppercase">Van valami különleges kérésed?</h4>
        </div>
        <textarea
          bind:value={message}
          placeholder="Írd meg ide, milyen egyedi színekre, mintákra gondoltál, vagy ha van bármilyen egyedi kérésed (pl. név hímzése)!"
          class="mt-4 flex-1 text-sm min-h-22 bg-white border border-brown-200 rounded p-2 focus:outline-none focus:ring-2 focus:ring-sand-300/40 transition-all"
        >
        </textarea>
      </div>
    </div>
    <div class="flex flex-col gap-2 mt-4"></div>
    <div class="flex items-center gap-2 p-2 rounded bg-brown-100 border border-gray-300">
      <Icon icon="mdi:info" class="shrink-0 text-2xl text-yellow-500" />
      <p class="text-xs text-yellow-700">
        Jelenleg a rendelési folyamat tesztelés alatt áll. Ha bármilyen problémát tapasztalsz,
        kérlek, jelezd nekünk a <a
          class="text-yellow-700 underline hover:text-yellow-900"
          href={`mailto:${params.address?.email ?? ""}?subject=Babasarok rendelési probléma&body=Kérlek, írd le a problémát, ha lehet screenshot-tal együtt.&cc=attilagreguss@protonmail.com`}
          >email címünkön</a
        >.
      </p>
    </div>
    {#if success}
      <p class="pt-4 text-sm text-green-500">{success}</p>
    {/if}
    {#if error}
      <p class="pt-4 text-sm text-red-500">{error}</p>
    {/if}
    <Button
      class="mt-4 h-10 uppercase"
      variant="contained"
      type="submit"
      disabled={!valid || sending}>Kérem az ingyenes ajánlatot!</Button
    >
  </div>
</form>

<style>
  dialog::backdrop {
    background: rgb(0 0 0 / 50%);
  }
</style>
