<script lang="ts">
  import { onMount } from "svelte";
  import Icon from "@iconify/svelte";
  import Button from "@/components/ui/ActionButton.svelte";
  import IconButton from "@/components/ui/IconButton.svelte";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import { basket } from "@/lib/basket/basket.svelte";
  import { formatMoney } from "@/lib/basket/money";
  import { replaceUrl } from "@/lib/history";
  import { reasonText, type Reason } from "@/lib/basket/refusalText";
  import { findLine, type PriceChange } from "@/lib/basket/stale";
  import {
    initialVariant,
    variantForOption,
    type ReadyMadeOrdering,
  } from "@/lib/catalog/readyMade";
  import { countFromParams } from "@/lib/product/pageParams";
  import { localizedPath, type Locale } from "@/lib/i18n";
  import type { i18n as I18n } from "i18next";
  import VariantOptions from "./VariantOptions.svelte";

  interface Props {
    locale: Locale;
    slug: string;
    ordering: ReadyMadeOrdering;
  }

  let { locale, slug, ordering }: Props = $props();

  let pickedVariantId = $state<string>();
  let count = $state(1);
  let editingLineId = $state<string | null>(null);
  let savedVariantId = $state<string | null>(null);
  let savedCount = $state<number | null>(null);
  let saved = $state(false);
  let busy = $state(false);
  let error = $state<Reason | null>(null);
  let refused = $state(false);
  let priceNotice = $state<(PriceChange & { currencyCode: string }) | null>(null);
  let restored = false;

  const variant = $derived(initialVariant(ordering, pickedVariantId));
  const isDirty = $derived(
    savedCount !== null && (count !== savedCount || variant?.id !== savedVariantId)
  );
  const maxCount = $derived(variant?.saleableStock ?? undefined);

  function startFresh(): void {
    pickedVariantId = undefined;
    count = 1;
    editingLineId = null;
    savedCount = null;
    savedVariantId = null;

    const prefill = countFromParams(new URLSearchParams(globalThis.location.search));

    if (prefill !== undefined) {
      count = maxCount === undefined ? prefill : Math.min(prefill, maxCount);
    }
  }

  onMount(() => {
    basket.start();

    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (editingLineId !== null && isDirty) {
        event.preventDefault();
      }
    };

    globalThis.addEventListener("beforeunload", onBeforeUnload);

    startFresh();

    return () => {
      globalThis.removeEventListener("beforeunload", onBeforeUnload);
    };
  });

  $effect(() => {
    if (restored || !basket.loaded) {
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

    count = line.quantity;
    editingLineId = line.id;
    savedCount = line.quantity;
    pickedVariantId = line.productVariant.id;
    savedVariantId = line.productVariant.id;
  });

  function pick(optionId: string): void {
    const next = variantForOption(ordering, variant, optionId);

    if (next === undefined) {
      return;
    }

    pickedVariantId = next.id;
    saved = false;

    if (next.saleableStock !== null && count > next.saleableStock) {
      count = Math.max(1, next.saleableStock);
    }
  }

  function refuse(reason: Reason): false {
    error = reason;
    refused = true;
    return false;
  }

  async function save(): Promise<void> {
    if (busy) {
      return;
    }

    error = null;
    refused = false;
    priceNotice = null;
    saved = false;
    busy = true;

    try {
      await upsertLine();
    } finally {
      busy = false;
    }
  }

  async function upsertLine(): Promise<void> {
    if (variant === undefined) {
      refuse("errors.notOrderable");
      return;
    }

    const chosen = variant;
    const existing =
      editingLineId === null
        ? undefined
        : basket.order?.lines.find((candidate) => candidate.id === editingLineId);
    const sameVariant = existing?.productVariant.id === chosen.id;
    const result = await (existing && sameVariant
      ? basket.adjust(existing.id, count)
      : basket.add({
          productVariantId: chosen.id,
          quantity: count,
          customFields: { selections: "{}" },
        }));

    if (!result.ok) {
      refuse(result.failure.reason);
      return;
    }

    const placed = findLine(result.value, {
      variantId: chosen.id,
      selections: "{}",
      lengthCm: undefined,
    });

    if (!placed) {
      refuse("errors.addFailed");
      return;
    }

    if (existing && placed.id !== existing.id) {
      const removal = await basket.remove(existing.id);

      if (!removal.ok) {
        refuse(removal.failure.reason);
        return;
      }
    }

    basket.rememberShownPrice(placed.id, chosen.priceWithTax);

    if (chosen.priceWithTax !== placed.unitPriceWithTax) {
      priceNotice = {
        shown: chosen.priceWithTax,
        actual: placed.unitPriceWithTax,
        currencyCode: result.value.currencyCode,
      };
    }

    if (editingLineId !== null) {
      count = placed.quantity;
      savedCount = placed.quantity;
      savedVariantId = chosen.id;
      editingLineId = placed.id;
      saved = true;

      const url = new URL(globalThis.location.href);
      url.searchParams.set("line", placed.id);
      replaceUrl(url);

      return;
    }

    startFresh();
    saved = true;

    const url = new URL(globalThis.location.href);
    url.searchParams.delete("line");
    replaceUrl(url);
  }
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    <div class="not-prose w-full text-left text-body">
      {#if variant}
        {#if ordering.optionGroups.length > 0}
          <div class="mb-4">
            <VariantOptions {i18n} {ordering} selected={variant} onPick={pick} />
          </div>
        {/if}

        <div class="flex flex-col gap-1">
          {#if count > 1}
            <div class="flex justify-between text-xs text-brown-600">
              <p>{i18n.t("price.perUnit")}</p>
              <p>{formatMoney(variant.priceWithTax, ordering.currencyCode)}</p>
            </div>
          {/if}

          <div class="flex justify-between items-baseline pt-0.5">
            <p class="text-sm font-medium">
              {i18n.t("price.total")}
              {#if count > 1}
                <span class="text-xs font-normal text-brown-500"
                  >({count} {i18n.t("common.piece")})</span
                >
              {/if}
            </p>
            <p class="text-base font-semibold text-brown-800">
              {formatMoney(variant.priceWithTax * count, ordering.currencyCode)}
            </p>
          </div>
        </div>
      {/if}

      {#if error}
        <div class="mt-3 flex flex-col items-start gap-2 text-sm text-danger-500">
          <p>{reasonText(i18n, error)}</p>
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
            href={localizedPath("/checkout", locale)}
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
            disabled={count <= 1}
            onclick={() => {
              count--;
              saved = false;
            }}
          >
            <Icon icon="mdi:minus" class="h-[1em]" />
          </IconButton>
          <span class="text-sm font-semibold select-none">{count} {i18n.t("common.piece")}</span>
          <IconButton
            class="text-xl"
            type="button"
            aria-label={i18n.t("common.quantityIncrease")}
            disabled={maxCount !== undefined && count >= maxCount}
            onclick={() => {
              count++;
              saved = false;
            }}
          >
            <Icon icon="mdi:add" class="h-[1em]" />
          </IconButton>
        </div>

        {#if variant?.saleableStock != null}
          <p class="mt-2 text-sm text-sand-700">
            {i18n.t("readyMade.stock", { count: variant.saleableStock })}
          </p>
        {/if}

        <Button
          class="h-11 flex-1 uppercase"
          variant="contained"
          type="button"
          disabled={busy || variant === undefined}
          onclick={save}
        >
          {editingLineId === null ? i18n.t("order.addToBasket") : i18n.t("order.updateBasket")}
        </Button>
      </div>
    </div>
  {/snippet}
</I18nGate>
