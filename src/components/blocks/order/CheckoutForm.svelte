<script lang="ts">
  import { onMount } from "svelte";
  import Icon from "@iconify/svelte";
  import { fade } from "svelte/transition";
  import CheckoutItem from "./CheckoutItem.svelte";
  import CheckoutDeals from "./CheckoutDeals.svelte";
  import OrderDelivery from "./OrderDelivery.svelte";
  import Button from "./common/Button.svelte";
  import TextInput from "./common/TextInput.svelte";
  import { orderBasket } from "@/lib/orderBasket.svelte";
  import { restoreProducts } from "@/lib/orderProduct";
  import { loadOrderState, updateOrderEnvelope } from "@/lib/orderStorage";
  import { isItemValid, validateItem } from "@/lib/validation";
  import { submitOrder, calculateOrderTotal } from "@/lib/orderSubmit";
  import { calculatePriceForItem, resolveSetCoverage } from "@/lib/priceUtils";
  import type {
    CmsEnhancedConfig,
    CmsEnhancedDeliveryMethod,
    CmsEnhancedEmbroideryColor,
    CmsEnhancedProduct,
    CmsProductGroup,
  } from "@/lib/data";
  import type { IProduct } from "@/lib/types.svelte";

  interface Props {
    products: Record<string, CmsEnhancedProduct>;
    deliveryMethods: Record<string, CmsEnhancedDeliveryMethod>;
    // Only the form endpoint and support address are needed; passing the full
    // config would serialize the heavyweight logo images into the island props.
    config: Pick<CmsEnhancedConfig, "fabformURL" | "address">;
    threadColors: CmsEnhancedEmbroideryColor[];
    productGroups: CmsProductGroup[];
    slugByProductId: Record<string, string | undefined>;
  }

  let {
    products: productInfo,
    deliveryMethods,
    config: params,
    threadColors,
    productGroups,
    slugByProductId,
  }: Props = $props();

  const catalog = $derived($state.snapshot(productInfo));

  const savedState = loadOrderState();
  let name = $state(savedState?.name ?? "");
  let email = $state(savedState?.email ?? "");
  let phone = $state(savedState?.phone ?? "");
  let deliveryMethod = $state<string>(savedState?.deliveryMethod ?? "");
  let address = $state<string>(savedState?.address ?? "");
  let message = $state(savedState?.message ?? "");

  let mounted = $state(false);
  let sending = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);

  // Basket lines to highlight while a set discount is hovered/pinned in the deals
  // panel, so the user sees which items earn it.
  let highlightedUuids = $state<string[]>([]);

  // The persisted basket as live order items against the current catalog.
  const basket = $derived(
    mounted ? restoreProducts($state.snapshot(orderBasket.items), catalog) : []
  );

  const setCoverageByUuid = $derived(resolveSetCoverage(basket, productGroups));

  const itemsTotal = $derived.by(() => {
    const prices = basket.map((p) => calculatePriceForItem(p, setCoverageByUuid.get(p.uuid)));
    return {
      total: prices.reduce((sum, p) => sum + (p.totalPrice ?? 0), 0),
      indeterminate: prices.some((p) => p.indeterminate),
    };
  });

  const deliveryData = $derived<CmsEnhancedDeliveryMethod | undefined>(
    deliveryMethods[deliveryMethod]
  );

  const grandTotal = $derived(itemsTotal.total + (deliveryData?.price ?? 0));

  const valid = $derived(basket.length > 0 && name.trim() !== "" && email.trim() !== "");

  onMount(() => {
    orderBasket.start();
    orderBasket.pruneAgainstCatalog(catalog);
    mounted = true;
  });

  // Persist the contact/delivery envelope without touching the basket products.
  $effect(() => {
    if (!mounted) {
      return;
    }
    updateOrderEnvelope({ name, email, phone, deliveryMethod, address, message });
  });

  function editHref(item: IProduct): string | undefined {
    const slug = slugByProductId[item.product_id];
    return slug ? `/product/${slug}/?uuid=${item.uuid}` : undefined;
  }

  async function onSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    error = null;
    success = null;

    const items = basket;
    for (const item of items) {
      validateItem(item);
    }
    if (items.some((item) => !isItemValid(item))) {
      error =
        "Néhány termék adatai hiányosak. Kérlek, a szerkesztés gombbal töltsd ki a hiányzó mezőket.";
      return;
    }

    const deliveryMethodData = deliveryData;
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
        products: items,
        threadColors,
        productGroups,
      },
      { accessKey: params.fabformURL ?? "", message }
    );
    sending = false;

    if (!result.ok) {
      error = result.message;
      return;
    }

    if (globalThis.window.fbq) {
      try {
        globalThis.window.fbq("track", "Purchase", {
          currency: "HUF",
          value: calculateOrderTotal(
            items,
            deliveryMethodData,
            resolveSetCoverage(items, productGroups)
          ).total,
          num_items: items.length,
        });
      } catch (e) {
        console.error("Failed to record purchase", e);
      }
    }

    orderBasket.clear();
    success = "Árajánlatkérésed sikeresen elküldve! Hamarosan felvesszük veled a kapcsolatot.";
  }
</script>

<div class="mx-auto flex w-full max-w-160 flex-col gap-6 text-body lg:max-w-5xl">
  {#if !mounted}
    <div
      class="min-h-64 w-full animate-pulse rounded-xl border border-brown-200 bg-brown-100 lg:mx-auto lg:max-w-160"
    ></div>
  {:else if success}
    <div
      class="flex flex-col items-center gap-3 rounded-2xl border border-green-600 bg-green-50 p-8 text-center lg:mx-auto lg:max-w-160"
    >
      <Icon icon="mdi:check-circle" class="text-4xl text-green-600" />
      <p class="text-green-800">{success}</p>
      <a
        href="/product/"
        class="mt-2 flex h-11 items-center justify-center rounded-md bg-brown-500 px-4 text-sm font-medium uppercase text-white transition-all hover:bg-brown-700"
      >
        Vissza a termékekhez
      </a>
    </div>
  {:else if basket.length === 0}
    <div
      class="flex flex-col items-center gap-3 rounded-2xl border border-brown-200 bg-brown-50 p-8 text-center lg:mx-auto lg:max-w-160"
    >
      <Icon icon="mdi:cart-outline" class="text-4xl text-brown-400" />
      <p class="text-brown-600">A kosarad üres.</p>
      <a
        href="/product/"
        class="mt-2 flex h-11 items-center justify-center rounded-md bg-brown-500 px-4 text-sm font-medium uppercase text-white transition-all hover:bg-brown-700"
      >
        Nézd meg a termékeket
      </a>
    </div>
  {:else}
    <form class="grid grid-cols-1 items-start gap-6 lg:grid-cols-2" onsubmit={onSubmit}>
      <section class="flex flex-col gap-3 lg:col-span-2">
        <div class="flex items-center gap-2">
          <Icon
            icon="mdi:account"
            class="shrink-0 rounded-full bg-brown-50 p-2 text-4xl text-brown-500"
          />
          <h2 class="text-lg uppercase">Hova küldhetjük a terveket?</h2>
        </div>
        <div class="flex flex-col gap-2">
          <TextInput type="text" placeholder="Név *" required bind:value={name} />
          <TextInput type="email" placeholder="Email cím *" required bind:value={email} />
          <TextInput type="tel" placeholder="Telefonszám" bind:value={phone} />
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <Icon
            icon="mdi:cart"
            class="shrink-0 rounded-full bg-brown-50 p-2 text-4xl text-brown-500"
          />
          <h2 class="text-lg uppercase">A kosarad</h2>
        </div>
        {#each basket as item (item.uuid)}
          <div transition:fade={{ duration: 200 }}>
            <CheckoutItem
              product={item}
              {threadColors}
              editHref={editHref(item)}
              setCoverage={setCoverageByUuid.get(item.uuid)}
              highlighted={highlightedUuids.includes(item.uuid)}
              onRemove={() => orderBasket.remove(item.uuid)}
            />
          </div>
        {/each}
      </section>

      <div class="flex flex-col gap-6">
        <CheckoutDeals
          {basket}
          products={productInfo}
          {productGroups}
          {slugByProductId}
          onHighlight={(uuids) => (highlightedUuids = uuids)}
        />

        <OrderDelivery {deliveryMethods} bind:deliveryMethod bind:address />

        <div class="flex flex-col rounded-xl bg-brown-200 p-4">
          <div class="flex items-center gap-2">
            <Icon icon="mdi:message-text" class="shrink-0 text-2xl text-brown-500" />
            <h2 class="text-lg uppercase">Van valami különleges kérésed?</h2>
          </div>
          <textarea
            bind:value={message}
            placeholder="Írd meg ide, milyen egyedi színekre, mintákra gondoltál, vagy ha van bármilyen egyedi kérésed (pl. név hímzése)!"
            class="mt-4 min-h-22 rounded border border-brown-200 bg-white p-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-sand-300/40"
          ></textarea>
        </div>

        <div class="flex items-center justify-between rounded-xl bg-brown-50 p-4">
          <span class="text-lg font-medium uppercase">Végösszeg</span>
          <span class="text-lg font-semibold text-dark">
            {grandTotal} Ft{itemsTotal.indeterminate ? " + ??" : ""}
          </span>
        </div>

        <div class="flex items-center gap-2 rounded border border-gray-300 bg-brown-100 p-2">
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

        {#if error}
          <p class="text-sm text-red-500">{error}</p>
        {/if}

        <Button
          class="h-11 uppercase"
          variant="contained"
          type="submit"
          disabled={!valid || sending}
        >
          Kérem az ingyenes ajánlatot!
        </Button>
      </div>
    </form>
  {/if}
</div>
