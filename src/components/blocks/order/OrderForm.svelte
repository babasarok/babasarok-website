<script lang="ts">
  import Icon from "@iconify/svelte";
  import OrderItem from "./OrderItem.svelte";
  import { fade } from "svelte/transition";
  import IconButton from "./common/IconButton.svelte";
  import Button from "./common/Button.svelte";
  import TextInput from "./common/TextInput.svelte";
  import { isItemValid, validateItem } from "@/lib/validation";
  import { sanitizeItem } from "@/lib/validation";
  import Masonry from "svelte-bricks";
  import { generateFormData } from "@/lib/emailConverter";
  import { submitOrder } from "@/lib/orderSubmit";
  import OrderDelivery from "./OrderDelivery.svelte";
  import type { CmsConfig, CmsDeliveryMethod, CmsProduct } from "@/lib/data";
  import type { IProduct } from "@/lib/types.svelte";

  import type { ProductMaterialValue } from "@/lib/types.svelte";

  interface Props {
    products: Record<string, CmsProduct>;
    deliveryMethods: Record<string, CmsDeliveryMethod>;
    config: CmsConfig;
  }

  let { products: productInfo, deliveryMethods, config: params }: Props = $props();

  let error: string | null = $state(null);
  let success: string | null = $state(null);
  let name = $state("");
  let email = $state("");
  let phone = $state("");
  let deliveryMethod = $state<string>("");
  let message = $state("");
  let products = $state<IProduct[]>([]);

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

    const serializedData = generateFormData(name, email, phone, deliveryMethodData, products);

    sending = true;
    const result = await submitOrder(serializedData, {
      accessKey: params.fabformURL ?? "",
      message,
    });
    sending = false;

    if (!result.ok) {
      error = result.message;
      return;
    }

    success = "Árajánlatkérésed sikeresen elküldve! Hamarosan felvesszük veled a kapcsolatot.";
    products = [];

    if (globalThis.window.fbq) {
      try {
        globalThis.window.fbq("track", "Purchase", {
          currency: "HUF",
          value: serializedData.ár.összár,
          num_items: serializedData.termékek.length,
        });
      } catch (e) {
        console.error("Failed to record purchase", e);
      }
    }
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
      <div class="flex items-center gap-2 justify-between">
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
        <IconButton type="button" popovertarget="product-dialog">
          <Icon icon="mdi:add" class="size-8" />
        </IconButton>
      </div>
      <dialog
        class="h-[80%] w-[80%] md:w-fit md:h-fit md:max-h-[80%] m-auto border-0 rounded-2xl shadow-lg"
        id="product-dialog"
        popover
      >
        <div class="flex flex-col gap-4 h-full py-4">
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
            <IconButton type="button" popovertarget="product-dialog" popovertargetaction="hide">
              <Icon icon="mdi:close" />
            </IconButton>
          </div>
          <div class="flex-1 overflow-auto flex flex-col gap-2">
            {#each Object.values(productInfo).toSorted( (a, b) => a.title.localeCompare(b.title) ) as product (product.product_id)}
              {@const addedCount = products.reduce(
                (count, p) => (p.title === product.title ? count + 1 : count),
                0
              )}
              <button
                type="button"
                class="flex font-normal w-full justify-between items-center gap-4 p-1 px-4 rounded hover:bg-brown-200 transition-all cursor-pointer"
                onclick={() => {
                  const clone = $state.snapshot(product);
                  products.splice(
                    0,
                    0,
                    sanitizeItem({
                      ...clone,
                      uuid: crypto.randomUUID(),
                      count: 1,
                      fields: clone.fields?.filter((f) => f != null) ?? [],
                      materials: {
                        ...clone.materials,
                        __typename: clone.materials?.__typename ?? "ProductMaterials",
                        materials: clone.materials?.materials?.filter((m) => m != null) ?? [],
                        banned_combinations:
                          clone.materials?.banned_combinations?.filter((c) => c != null) ?? [],
                        material_required_count: clone.materials?.material_required_count ?? 1,
                        values: [] as Array<ProductMaterialValue | undefined>,
                      },
                    })
                  );
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
      <Masonry
        items={products}
        getId={(item) => item.uuid}
        gap={16}
        order="column-sequential"
        animate={false}
      >
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
                  products[index] = sanitizeItem(updatedProduct);
                }
              }}
            />
          </div>
        {/snippet}
      </Masonry>
    </div>
    <div class="w-full h-0.5 bg-brown-200 mt-4"></div>
    <div class="flex gap-4 flex-wrap mt-6 relative">
      <OrderDelivery {deliveryMethods} bind:deliveryMethod />
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
