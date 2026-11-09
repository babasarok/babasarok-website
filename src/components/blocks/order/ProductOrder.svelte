<script lang="ts">
  import { onMount } from "svelte";
  import Icon from "@iconify/svelte";
  import type { ProductDefinition } from "@babasarok/product-definition";
  import { parseLineSelections, type LineSelections } from "@babasarok/pricing";
  import OrderItem from "./OrderItem.svelte";
  import SetPanel from "./SetPanel.svelte";
  import RelatedItems from "./RelatedItems.svelte";
  import Button from "./common/Button.svelte";
  import IconButton from "./common/IconButton.svelte";
  import { basket } from "@/lib/basket/basket.svelte";
  import type { LineInput } from "@/lib/basket/api";
  import {
    applySelections,
    buildLine,
    buildSelections,
    type ConfiguredLine,
  } from "@/lib/basket/lineInput";
  import { formatMoney } from "@/lib/basket/money";
  import { findLine, lineMatches, type PriceChange } from "@/lib/basket/stale";
  import { liveUnitPrice } from "@/lib/catalog/livePrice";
  import { instantiateProduct, hasConfigurableOptions } from "@/lib/order/product";
  import { siblingsFor, relatedGroupsFor, resolveSetDiscount } from "@/lib/order/groups";
  import { prefillFromParams, buildMaterialParams } from "@/lib/order/queryParams";
  import { sanitizeItem, isItemValid, validateItem } from "@/lib/product/validation";
  import type { OrderThreadColor, OrderProduct, OrderProductGroup } from "@/lib/order/types";
  import type { IProduct } from "@/lib/types.svelte";
  import type { i18n as I18n } from "i18next";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import type { Locale } from "@/lib/i18n";
  import { translateMessage } from "@/lib/i18next-client";

  interface Props {
    locale: Locale;
    slug: string;
    product: OrderProduct;
    definition: ProductDefinition;
    products: Record<string, OrderProduct>;
    productGroups: OrderProductGroup[];
    slugByProductId?: Record<string, string | undefined>;
    threadColors: OrderThreadColor[];
    checkoutHref?: string;
  }

  let {
    locale,
    slug,
    product,
    definition,
    products,
    productGroups,
    slugByProductId = {},
    threadColors,
    checkoutHref = "/checkout",
  }: Props = $props();

  let item = $state<IProduct | null>(null);
  let editingLineId = $state<string | null>(null);
  let savedKey = $state<string | null>(null);
  let saved = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);
  let refused = $state(false);
  let priceNotice = $state<(PriceChange & { currencyCode: string }) | null>(null);
  let restored = false;

  const toCatalog = (ids: string[]): OrderProduct[] =>
    ids.filter((id) => Object.hasOwn(products, id)).map((id) => products[id]);

  const relatedProducts = $derived(toCatalog(siblingsFor(product.product_id, productGroups)));

  const relatedGroups = $derived.by(() =>
    relatedGroupsFor(product.product_id, productGroups)
      .map((group) => ({ title: group.title, products: toCatalog(group.members) }))
      .filter((group) => group.products.length > 0)
  );

  const basketCountByProductId = $derived.by(() => {
    const countBySlug: Record<string, number> = {};
    for (const line of basket.order?.lines ?? []) {
      const lineSlug = line.productVariant.product.slug;
      countBySlug[lineSlug] = (countBySlug[lineSlug] ?? 0) + line.quantity;
    }
    const map: Record<string, number> = {};
    for (const [productId, productSlug] of Object.entries(slugByProductId)) {
      const count = productSlug ? countBySlug[productSlug] : undefined;
      if (count) {
        map[productId] = count;
      }
    }
    return map;
  });

  function configKey(current: IProduct): string {
    return JSON.stringify([buildSelections($state.snapshot(current.fields)), current.count]);
  }

  const isDirty = $derived(item !== null && savedKey !== null && configKey(item) !== savedKey);

  const setInfo = $derived(resolveSetDiscount(product.product_id, productGroups));

  onMount(() => {
    basket.start();

    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (editingLineId !== null && isDirty) {
        event.preventDefault();
      }
    };

    globalThis.addEventListener("beforeunload", onBeforeUnload);

    const fresh = instantiateProduct($state.snapshot(product));
    prefillFromParams(fresh, new URLSearchParams(globalThis.location.search));
    item = sanitizeItem(fresh);

    return () => {
      globalThis.removeEventListener("beforeunload", onBeforeUnload);
    };
  });

  $effect(() => {
    if (restored || !basket.loaded || item === null) {
      return;
    }

    restored = true;

    const params = new URLSearchParams(globalThis.location.search);
    const lineId = params.get("line");
    const line = basket.order?.lines.find(
      (candidate) => candidate.id === lineId && candidate.productVariant.product.slug === slug
    );

    if (!line) {
      return;
    }

    try {
      const next = $state.snapshot(item);
      const selections = parseLineSelections(line.customFields?.selections ?? null, locale);
      applySelections(next.fields, selections);
      applySelections(next.fields, partnerMaterials(params.get("syncFrom")));
      next.count = line.quantity;
      item = sanitizeItem(next);
      editingLineId = line.id;
      savedKey = configKey(next);
    } catch {
      editingLineId = null;
    }
  });

  function addInput(line: ConfiguredLine, quantity: number): LineInput {
    if (line.lengthCm === undefined) {
      return {
        productVariantId: line.variantId,
        quantity,
        customFields: { selections: line.selections },
      };
    }

    return {
      productVariantId: line.variantId,
      quantity,
      customFields: { selections: line.selections, lengthCm: line.lengthCm },
    };
  }

  function partnerMaterials(partnerLineId: string | null): LineSelections {
    const partner = basket.order?.lines.find((candidate) => candidate.id === partnerLineId);

    if (!partner) {
      return {};
    }

    const all = parseLineSelections(partner.customFields?.selections ?? null, locale);

    return Object.fromEntries(
      Object.entries(all).filter(([, selection]) => selection?.kind === "material")
    );
  }

  function refuse(message: string): false {
    error = message;
    refused = true;
    return false;
  }

  async function persistCurrent(): Promise<boolean> {
    if (!item || busy) {
      return false;
    }

    error = null;
    refused = false;
    priceNotice = null;
    validateItem(item);

    if (!isItemValid(item)) {
      error = "errors.validate";
      return false;
    }

    busy = true;

    try {
      return await upsertLine($state.snapshot(item));
    } finally {
      busy = false;
    }
  }

  async function upsertLine(current: IProduct): Promise<boolean> {
    const variantId = await basket.api.productVariantId(slug);

    if (!variantId.ok) {
      return refuse(variantId.failure.reason);
    }

    if (variantId.value === undefined) {
      return refuse("errors.notOrderable");
    }

    const line = buildLine(definition, current.fields, variantId.value);
    const existing = basket.order?.lines.find((candidate) => candidate.id === editingLineId);
    const unchanged = existing !== undefined && lineMatches(existing, line);
    const result = await (existing && unchanged
      ? basket.adjust(existing.id, current.count)
      : basket.add(addInput(line, current.count)));

    if (!result.ok) {
      return refuse(result.failure.reason);
    }

    const placed = findLine(result.value, line);

    if (!placed) {
      return refuse("errors.addFailed");
    }

    if (existing && placed.id !== existing.id) {
      const removal = await basket.remove(existing.id);

      if (!removal.ok) {
        return refuse(removal.failure.reason);
      }
    }

    const shown = liveUnitPrice(definition, current.title, current);

    if (shown !== null) {
      basket.rememberShownPrice(placed.id, shown);

      if (shown !== placed.unitPriceWithTax) {
        priceNotice = {
          shown,
          actual: placed.unitPriceWithTax,
          currencyCode: result.value.currencyCode,
        };
      }
    }

    if (item) {
      item.count = placed.quantity;
      savedKey = configKey(item);
    }

    editingLineId = placed.id;

    const url = new URL(globalThis.location.href);
    url.searchParams.set("line", placed.id);
    globalThis.history.replaceState(null, "", url);

    return true;
  }

  async function save(): Promise<void> {
    saved = false;
    saved = await persistCurrent();
  }

  async function addRelated(target: OrderProduct): Promise<void> {
    if (!item || !(await persistCurrent())) {
      return;
    }

    const targetSlug = slugByProductId[target.product_id];

    if (!targetSlug) {
      return;
    }

    if (hasConfigurableOptions($state.snapshot(target))) {
      const query = buildMaterialParams($state.snapshot(item)).toString();
      globalThis.location.href = `/product/${targetSlug}/${query ? `?${query}` : ""}`;
      return;
    }

    busy = true;

    try {
      const variantId = await basket.api.productVariantId(targetSlug);

      if (!variantId.ok) {
        refuse(variantId.failure.reason);
        return;
      }

      if (variantId.value === undefined) {
        refuse("errors.notOrderable");
        return;
      }

      const result = await basket.add({
        productVariantId: variantId.value,
        quantity: 1,
        customFields: { selections: "{}" },
      });

      if (!result.ok) {
        refuse(result.failure.reason);
        return;
      }

      saved = true;
    } finally {
      busy = false;
    }
  }
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    <div class="not-prose w-full text-left text-body">
      {#if item}
        <OrderItem
          {locale}
          product={item}
          {definition}
          {threadColors}
          bare
          onChange={(updated) => {
            item = sanitizeItem(updated);
            saved = false;
          }}
        />

        {#if error}
          <div class="mt-3 flex flex-col items-start gap-2 text-sm text-danger-500">
            <p>{translateMessage(i18n, error)}</p>
            {#if refused}
              <button
                type="button"
                class="cursor-pointer font-medium underline"
                onclick={() => globalThis.location.reload()}
              >
                {i18n.t("errors.reload")}
              </button>
            {/if}
          </div>
        {/if}

        {#if priceNotice}
          <div
            class="mt-3 flex items-center gap-2 rounded-xl border border-warning-400 bg-warning-50 p-3 text-sm text-warning-800"
          >
            <Icon icon="mdi:alert-circle" class="shrink-0" />
            {i18n.t("order.priceChangedBasket", {
              shown: formatMoney(priceNotice.shown, priceNotice.currencyCode),
              actual: formatMoney(priceNotice.actual, priceNotice.currencyCode),
            })}
          </div>
        {/if}

        {#if editingLineId !== null && isDirty}
          <div
            class="mt-3 flex items-center gap-2 rounded-xl border border-warning-400 bg-warning-50 p-3 text-sm text-warning-800"
          >
            <Icon icon="mdi:alert-circle" class="shrink-0" />
            {i18n.t("order.unsaved")}
          </div>
        {/if}

        {#if saved}
          <div
            class="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success-600 bg-success-50 p-3 text-sm text-success-800"
          >
            <span class="flex items-center gap-1">
              <Icon icon="mdi:check-circle" class="shrink-0" />
              {i18n.t("order.inBasket")}
            </span>
            <a
              href={checkoutHref}
              class="flex items-center gap-1 font-medium underline hover:text-success-900"
            >
              {i18n.t("order.toCheckout")}
              <Icon icon="mdi:arrow-right" class="shrink-0" />
            </a>
          </div>
        {/if}

        <div class="mt-4 flex items-center gap-3">
          <div
            class="flex h-11 items-center justify-between rounded-full border border-brown-300 bg-white px-2 w-32 shrink-0 shadow-xs"
          >
            <IconButton
              class="text-xl"
              type="button"
              aria-label={i18n.t("common.quantityDecrease")}
              disabled={item.count <= 1}
              onclick={() => {
                if (!item) {
                  return;
                }

                item.count--;
                saved = false;
              }}
            >
              <Icon icon="mdi:minus" class="h-[1em]" />
            </IconButton>
            <span class="text-sm font-semibold select-none"
              >{item.count} {i18n.t("common.piece")}</span
            >
            <IconButton
              class="text-xl"
              type="button"
              aria-label={i18n.t("common.quantityIncrease")}
              onclick={() => {
                if (!item) {
                  return;
                }

                item.count++;
                saved = false;
              }}
            >
              <Icon icon="mdi:add" class="h-[1em]" />
            </IconButton>
          </div>

          <Button
            class="h-11 flex-1 uppercase"
            variant="contained"
            type="button"
            disabled={busy}
            onclick={save}
          >
            {editingLineId === null ? i18n.t("order.addToBasket") : i18n.t("order.updateBasket")}
          </Button>
        </div>

        {#if relatedProducts.length > 0 && setInfo}
          <div class="mt-6">
            <SetPanel
              {locale}
              setTitle={setInfo.setTitle}
              {relatedProducts}
              {basketCountByProductId}
              {slugByProductId}
              ready={!busy}
              onAddRelated={addRelated}
            />
          </div>
        {/if}

        {#if relatedGroups.length > 0}
          <div class="mt-6">
            <RelatedItems groups={relatedGroups} {slugByProductId} {locale} />
          </div>
        {/if}
      {:else}
        <div
          class="min-h-64 w-full animate-pulse rounded-xl border border-brown-200 bg-brown-100"
          aria-hidden="true"
        ></div>
      {/if}
    </div>
  {/snippet}
</I18nGate>
