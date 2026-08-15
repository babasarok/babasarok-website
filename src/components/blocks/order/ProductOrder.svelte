<script lang="ts">
  import { onMount } from "svelte";
  import Icon from "@iconify/svelte";
  import OrderItem from "./OrderItem.svelte";
  import Button from "./common/Button.svelte";
  import { orderBasket } from "@/lib/orderBasket.svelte";
  import { instantiateProduct, restoreProducts } from "@/lib/orderProduct";
  import { prefillFromParams } from "@/lib/orderQueryParams";
  import { sanitizeItem } from "@/lib/validation";
  import { isItemValid, validateItem } from "@/lib/validation";
  import type { CmsEnhancedEmbroideryColor, CmsEnhancedProduct } from "@/lib/data";
  import type { IProduct } from "@/lib/types.svelte";

  interface Props {
    product: CmsEnhancedProduct;
    threadColors: CmsEnhancedEmbroideryColor[];
    checkoutHref?: string;
  }

  let { product, threadColors, checkoutHref = "/contact" }: Props = $props();

  let item = $state<IProduct | null>(null);
  let editing = $state(false);
  let saved = $state(false);
  let error = $state<string | null>(null);

  onMount(() => {
    orderBasket.start();

    const params = new URLSearchParams(globalThis.location.search);
    const uuid = params.get("uuid");
    const snapshot = $state.snapshot(product);

    if (uuid) {
      const existing = orderBasket.get(uuid);
      if (existing && existing.product_id === product.product_id) {
        const restored = restoreProducts([existing], { [product.product_id]: snapshot });
        if (restored.length > 0) {
          item = restored[0];
          editing = true;
          return;
        }
      }
    }

    const fresh = instantiateProduct(snapshot);
    prefillFromParams(fresh, params);
    item = sanitizeItem(fresh);
  });

  function save(): void {
    if (!item) {
      return;
    }
    error = null;
    validateItem(item);
    if (!isItemValid(item)) {
      error = "Kérlek, ellenőrizd a termék adatait, és töltsd ki a hiányzó mezőket.";
      return;
    }

    orderBasket.upsert($state.snapshot(item));
    editing = true;
    saved = true;

    // Keep the URL addressable so a refresh re-opens the same basket item.
    const url = new URL(globalThis.location.href);
    url.searchParams.set("uuid", item.uuid);
    globalThis.history.replaceState(null, "", url);
  }
</script>

<div class="not-prose w-full text-left text-body">
  {#if item}
    <OrderItem
      product={item}
      {threadColors}
      bare
      onChange={(updated) => {
        item = sanitizeItem(updated);
        saved = false;
      }}
    />

    {#if error}
      <p class="mt-3 text-sm text-red-500">{error}</p>
    {/if}

    {#if saved}
      <div
        class="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-green-600 bg-green-50 p-3 text-sm text-green-800"
      >
        <span class="flex items-center gap-1">
          <Icon icon="mdi:check-circle" class="shrink-0" />
          {editing ? "A kosár frissítve." : "A termék a kosárban van."}
        </span>
        <a
          href={checkoutHref}
          class="flex items-center gap-1 font-medium underline hover:text-green-900"
        >
          Tovább a pénztárhoz
          <Icon icon="mdi:arrow-right" class="shrink-0" />
        </a>
      </div>
    {/if}

    <Button class="mt-4 h-11 w-full uppercase" variant="contained" type="button" onclick={save}>
      {editing ? "Kosár frissítése" : "Kosárba"}
    </Button>
  {:else}
    <div
      class="min-h-64 w-full animate-pulse rounded-xl border border-brown-200 bg-brown-100"
      aria-hidden="true"
    ></div>
  {/if}
</div>
