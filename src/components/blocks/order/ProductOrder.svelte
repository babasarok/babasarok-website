<script lang="ts">
  import { onMount } from "svelte";
  import Icon from "@iconify/svelte";
  import OrderItem from "./OrderItem.svelte";
  import SetPanel from "./SetPanel.svelte";
  import Button from "./common/Button.svelte";
  import { orderBasket } from "@/lib/orderBasket.svelte";
  import {
    instantiateProduct,
    instantiateRelatedProduct,
    restoreProducts,
    syncMaterialsToPartner,
    hasConfigurableOptions,
  } from "@/lib/orderProduct";
  import { resolveSetDiscount, resolveSetDiscountStatus } from "@/lib/priceUtils";
  import type { SetDiscountStatus } from "@/lib/priceUtils";
  import { prefillFromParams, buildMaterialParams } from "@/lib/orderQueryParams";
  import { mapProductToSaved } from "@/lib/orderStorage";
  import { sanitizeItem } from "@/lib/validation";
  import { isItemValid, validateItem } from "@/lib/validation";
  import type { CmsEnhancedEmbroideryColor, CmsEnhancedProduct, CmsProductGroup } from "@/lib/data";
  import type { IProduct } from "@/lib/types.svelte";

  interface Props {
    product: CmsEnhancedProduct;
    products: Record<string, CmsEnhancedProduct>;
    productGroups: CmsProductGroup[];
    slugByProductId?: Record<string, string | undefined>;
    threadColors: CmsEnhancedEmbroideryColor[];
    checkoutHref?: string;
  }

  let {
    product,
    products,
    productGroups,
    slugByProductId = {},
    threadColors,
    checkoutHref = "/checkout",
  }: Props = $props();

  // Plain (non-proxy) catalog; the props are reactive and structuredClone-hostile.
  const catalog = $derived($state.snapshot(products));

  let item = $state<IProduct | null>(null);
  let editing = $state(false);
  let saved = $state(false);
  let error = $state<string | null>(null);

  // The whole basket as live order items, with the currently configured item's
  // in-progress edits overlaid, so set status reflects the unsaved selection.
  // Inputs are snapshotted because restoreProducts structuredClones them.
  const basket = $derived.by(() => {
    const restored = restoreProducts($state.snapshot(orderBasket.items), catalog);
    const current = item;
    if (!current) {
      return restored;
    }
    const index = restored.findIndex((p) => p.uuid === current.uuid);
    if (index === -1) {
      restored.push(current);
    } else {
      restored[index] = current;
    }
    return restored;
  });

  // Group siblings of this product that exist in the catalog; drives the
  // "add to set" chips.
  const relatedProducts = $derived.by(() => {
    const id = product.product_id;
    const out: CmsEnhancedProduct[] = [];
    for (const group of productGroups) {
      if (!group.products.some((m) => m.product_id === id)) {
        continue;
      }
      for (const { product_id: otherId } of group.products) {
        if (otherId === id || !Object.hasOwn(products, otherId)) {
          continue;
        }
        const sibling = products[otherId];
        if (!out.some((p) => p.product_id === otherId)) {
          out.push(sibling);
        }
      }
    }
    return out;
  });

  // Potential set discount per product, for annotating the "add to set" chips.
  const discountByProductId = $derived.by(() => {
    const map: Record<string, number> = {};
    for (const p of Object.values(products)) {
      const best = resolveSetDiscount(p.product_id, productGroups);
      if (best) {
        map[p.product_id] = best.percent;
      }
    }
    return map;
  });

  const basketCountByProductId = $derived.by(() => {
    const map: Record<string, number> = {};
    for (const it of basket) {
      map[it.product_id] = (map[it.product_id] ?? 0) + it.count;
    }
    return map;
  });

  // True while the local item differs from (or is missing from) the persisted
  // basket line. Structural comparison on the persisted shape (transient
  // `error`s stripped by `mapProductToSaved`), so it also catches external
  // drift from other tabs/islands, not just local edits.
  const isDirty = $derived.by(() => {
    if (!item) {
      return false;
    }
    const persisted = orderBasket.get(item.uuid);
    if (!persisted) {
      return true;
    }
    return (
      JSON.stringify(mapProductToSaved(sanitizeItem($state.snapshot(item)))) !==
      JSON.stringify(persisted)
    );
  });

  const setStatus = $derived<SetDiscountStatus | undefined>(
    item ? resolveSetDiscountStatus(item, basket, productGroups) : undefined
  );

  // Whether this product is fully configured, so set siblings can be added
  // without surfacing a validation error. Validated on a snapshot so the live
  // item doesn't flash field errors before the user submits.
  const itemReady = $derived(item ? isItemValid(validateItem($state.snapshot(item))) : false);

  // Title + potential discount of the set this product belongs to, for the panel
  // header (falls back to the group title when the product itself has no discount).
  const setInfo = $derived.by(() => {
    const best = resolveSetDiscount(product.product_id, productGroups);
    if (best) {
      return best;
    }
    const group = productGroups.find((g) =>
      g.products.some((m) => m.product_id === product.product_id)
    );
    return group ? { percent: undefined, setTitle: group.title } : undefined;
  });

  function addRelated(target: CmsEnhancedProduct): void {
    if (!item) {
      return;
    }
    // Ensure the product being configured is in the basket first, so the set
    // always includes it and its edits aren't lost when we navigate away.
    if (!persistCurrent()) {
      return;
    }

    const targetSnap = $state.snapshot(target);
    // Siblings with their own options can't be configured from defaults; send
    // the user to the sibling's page with the current materials preselected.
    if (hasConfigurableOptions(targetSnap)) {
      const slug = slugByProductId[target.product_id];
      if (slug) {
        const query = buildMaterialParams($state.snapshot(item)).toString();
        globalThis.location.href = `/product/${slug}/${query ? `?${query}` : ""}`;
        return;
      }
    }

    orderBasket.upsert(instantiateRelatedProduct(targetSnap, $state.snapshot(item)));
    saved = true;
  }

  function syncToSet(): void {
    if (!item || setStatus?.state !== "pending-material") {
      return;
    }
    const partner = basket.find((p) => p.uuid === setStatus.partnerUuid);
    if (!partner) {
      return;
    }
    item = sanitizeItem(syncMaterialsToPartner($state.snapshot(item), $state.snapshot(partner)));
    saved = false;
  }

  onMount(() => {
    orderBasket.start();

    // Warn on refresh/close while a saved item has unsaved changes. (A fresh,
    // never-saved item is intentionally not guarded: the "Kosárba" button is
    // the visible state, and warning on every reload would be noise.)
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (editing && isDirty) {
        event.preventDefault();
      }
    };

    globalThis.addEventListener("beforeunload", onBeforeUnload);

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

    return () => {
      globalThis.removeEventListener("beforeunload", onBeforeUnload);
    };
  });

  function persistCurrent(): boolean {
    if (!item) {
      return false;
    }
    error = null;
    validateItem(item);
    if (!isItemValid(item)) {
      error = "Kérlek, ellenőrizd a termék adatait, és töltsd ki a hiányzó mezőket.";
      return false;
    }

    const survivingUuid = orderBasket.upsert($state.snapshot(item));
    if (survivingUuid !== item.uuid) {
      // The item was merged into an identical basket line: re-point the local
      // item (and the URL below) to the surviving line, adopting its summed
      // count so the page keeps editing exactly that line.
      const merged = orderBasket.get(survivingUuid);
      if (merged) {
        item.uuid = survivingUuid;
        item.count = merged.count;
      }
    }
    editing = true;

    // Keep the URL addressable so a refresh re-opens the same basket item.
    const url = new URL(globalThis.location.href);
    url.searchParams.set("uuid", item.uuid);
    globalThis.history.replaceState(null, "", url);
    return true;
  }

  function save(): void {
    if (persistCurrent()) {
      saved = true;
    }
  }
</script>

<div class="not-prose w-full text-left text-body">
  {#if item}
    <OrderItem
      product={item}
      {threadColors}
      bare
      setDiscount={setStatus?.state === "active" ? setStatus : undefined}
      onChange={(updated) => {
        item = sanitizeItem(updated);
        saved = false;
      }}
    />

    {#if error}
      <p class="mt-3 text-sm text-danger-500">{error}</p>
    {/if}

    {#if editing && isDirty}
      <div
        class="mt-3 flex items-center gap-2 rounded-xl border border-warning-400 bg-warning-50 p-3 text-sm text-warning-800"
      >
        <Icon icon="mdi:alert-circle" class="shrink-0" />
        Nincs mentve: a módosítások még nem kerültek a kosárba.
      </div>
    {/if}

    {#if saved}
      <div
        class="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success-600 bg-success-50 p-3 text-sm text-success-800"
      >
        <span class="flex items-center gap-1">
          <Icon icon="mdi:check-circle" class="shrink-0" />
          {editing ? "A kosár frissítve." : "A termék a kosárban van."}
        </span>
        <a
          href={checkoutHref}
          class="flex items-center gap-1 font-medium underline hover:text-success-900"
        >
          Tovább a pénztárhoz
          <Icon icon="mdi:arrow-right" class="shrink-0" />
        </a>
      </div>
    {/if}

    <Button class="mt-4 h-11 w-full uppercase" variant="contained" type="button" onclick={save}>
      {editing ? "Kosár frissítése" : "Kosárba"}
    </Button>

    {#if relatedProducts.length > 0 && setInfo}
      <div class="mt-6">
        <SetPanel
          setTitle={setInfo.setTitle}
          percent={setInfo.percent}
          {setStatus}
          {relatedProducts}
          relatedDiscounts={discountByProductId}
          {basketCountByProductId}
          {slugByProductId}
          ready={itemReady}
          onAddRelated={addRelated}
          onSyncToSet={syncToSet}
        />
      </div>
    {/if}
  {:else}
    <div
      class="min-h-64 w-full animate-pulse rounded-xl border border-brown-200 bg-brown-100"
      aria-hidden="true"
    ></div>
  {/if}
</div>
