<script lang="ts">
  import Icon from "@iconify/svelte";
  import IconButton from "./common/IconButton.svelte";
  import { describeLine, type Labels } from "@/lib/basket/lineRows";
  import { formatMoney } from "@/lib/basket/money";
  import type { PriceChange } from "@/lib/basket/stale";
  import type { OrderLine } from "@/lib/basket/schemas";
  import { lineSetState, type PartnerLink } from "@/lib/basket/setDiscounts";
  import { ASSET_BASE } from "@/lib/vendure/client";
  import { imageUrl } from "@/lib/vendure/imageUrl";
  import type { i18n as I18n } from "i18next";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import { localizedPath, VENDURE_LANGUAGE_CODE, type Locale } from "@/lib/i18n";

  interface Props {
    locale: Locale;
    line: OrderLine;
    currencyCode: string;
    labels: Labels;
    partnerLinks: PartnerLink[];
    priceChange: PriceChange | undefined;
    /** Emphasise this line while its set discount is hovered/pinned in the deals panel. */
    highlighted: boolean;
    busy: boolean;
    onQuantity: (quantity: number) => void;
    onRemove: () => void;
  }

  let {
    locale,
    line,
    currencyCode,
    labels,
    partnerLinks,
    priceChange,
    highlighted,
    busy,
    onQuantity,
    onRemove,
  }: Props = $props();

  const product = $derived(line.productVariant.product);
  const rows = $derived(
    product.productDefinition
      ? describeLine(
          product.productDefinition,
          line.customFields?.selections ?? null,
          labels,
          VENDURE_LANGUAGE_CODE[locale]
        )
      : []
  );
  const setState = $derived(lineSetState(line));
  const thumbnail = $derived(
    product.featuredAsset ? imageUrl(product.featuredAsset.source, "card-sm", ASSET_BASE) : null
  );
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    <article
      class={[
        "flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm transition-all",
        highlighted
          ? "border-success-500 ring-2 ring-success-500"
          : line.invalidReason
            ? "border-danger-500"
            : "border-brown-200",
      ]}
      data-testid="checkout-line"
    >
      <div class="flex items-start gap-3">
        {#if thumbnail}
          <img
            src={thumbnail}
            alt={product.name}
            class="size-16 shrink-0 rounded-lg object-cover"
          />
        {:else}
          <div
            class="grid size-16 shrink-0 place-items-center rounded-lg bg-brown-50 text-brown-300"
          >
            <Icon icon="mdi:image-outline" class="text-2xl" />
          </div>
        {/if}
        <h3 class="min-w-0 flex-1 text-base font-medium leading-tight text-dark">{product.name}</h3>
      </div>

      {#if line.invalidReason}
        <p
          data-testid="line-invalid-reason"
          class="flex items-start gap-1 rounded-lg bg-danger-50 p-2 text-sm text-danger-500"
        >
          <Icon icon="mdi:alert-circle" class="mt-0.5 shrink-0" />
          {line.invalidReason.message}
        </p>
      {/if}

      {#if setState}
        <p
          class="flex flex-wrap items-center gap-2 text-xs text-brown-600"
          data-testid="line-set-state"
        >
          {setState.message}
          {#if setState.kind === "pending-material" && setState.syncFromLineId}
            <a
              href={localizedPath(
                `/product/${product.slug}/?line=${line.id}&syncFrom=${setState.syncFromLineId}`,
                locale
              )}
              class="flex items-center gap-1 rounded-full border border-brown-300 px-3 py-1 font-medium transition-all hover:bg-brown-100"
            >
              <Icon icon="mdi:sync" class="shrink-0" />
              {i18n.t("basket.syncMaterial")}
            </a>
          {/if}
          {#if setState.kind === "pending-partner"}
            {#each partnerLinks as partner (partner.slug)}
              <a
                href={localizedPath(`/product/${partner.slug}/`, locale)}
                data-testid="set-partner-link"
                class="flex items-center gap-1 rounded-full border border-brown-300 px-3 py-1 font-medium transition-all hover:bg-brown-100"
              >
                {partner.name}
              </a>
            {/each}
          {/if}
        </p>
      {/if}

      {#if priceChange}
        <p class="flex items-start gap-1 rounded-lg bg-warning-50 p-2 text-sm text-warning-800">
          <Icon icon="mdi:alert-circle" class="mt-0.5 shrink-0" />
          {i18n.t("order.priceChanged", {
            shown: formatMoney(priceChange.shown, currencyCode),
            actual: formatMoney(priceChange.actual, currencyCode),
          })}
        </p>
      {/if}

      {#if rows.length > 0}
        <dl class="flex flex-col gap-1 border-t border-brown-100 pt-3 text-sm">
          {#each rows as row (row.label)}
            <div class="flex justify-between gap-4">
              <dt class="text-brown-500">{row.label}</dt>
              <dd class="text-right text-dark">{row.value}</dd>
            </div>
          {/each}
        </dl>
      {/if}

      <div class="flex items-center justify-between border-t border-brown-100 pt-3">
        <div class="flex items-center gap-3 text-sm">
          <a
            href={localizedPath(`/product/${product.slug}/?line=${line.id}`, locale)}
            class="flex items-center gap-1 font-medium text-brown-600 transition-colors hover:text-brown-700"
          >
            <Icon icon="mdi:pencil" class="shrink-0" />
            {i18n.t("basket.edit")}
          </a>
          <button
            type="button"
            onclick={onRemove}
            disabled={busy}
            class="flex cursor-pointer items-center gap-1 text-brown-500 transition-colors hover:text-red-600"
          >
            <Icon icon="mdi:delete-outline" class="shrink-0" />
            {i18n.t("basket.remove")}
          </button>
        </div>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-1">
            <IconButton
              type="button"
              aria-label={i18n.t("common.quantityDecrease")}
              disabled={busy || line.quantity <= 1}
              onclick={() => onQuantity(line.quantity - 1)}
            >
              <Icon icon="mdi:minus" />
            </IconButton>
            <span class="text-sm select-none">{line.quantity} {i18n.t("common.piece")}</span>
            <IconButton
              type="button"
              aria-label={i18n.t("common.quantityIncrease")}
              disabled={busy}
              onclick={() => onQuantity(line.quantity + 1)}
            >
              <Icon icon="mdi:add" />
            </IconButton>
          </div>
          <p class="text-right font-medium text-dark">
            {formatMoney(line.discountedLinePriceWithTax, currencyCode)}
          </p>
        </div>
      </div>
    </article>
  {/snippet}
</I18nGate>
