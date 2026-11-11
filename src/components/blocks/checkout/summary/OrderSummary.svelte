<script lang="ts">
  import Icon from "@iconify/svelte";
  import LineCard from "./LineCard.svelte";
  import SetChips from "./SetChips.svelte";
  import { formatMoney } from "@/lib/basket/money";
  import type { Labels } from "@/lib/basket/lineRows";
  import type { Order, OrderLine } from "@/lib/basket/schemas";
  import { partnerLinks, type SetMembers } from "@/lib/basket/setDiscounts";
  import { priceChange, type PriceChange, type ShownPrices } from "@/lib/basket/stale";
  import type { i18n as I18n } from "i18next";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import type { Locale } from "@/lib/i18n";

  interface Props {
    locale: Locale;
    order: Order;
    labels: Labels;
    setMembers: SetMembers;
    highlightedLines: readonly string[];
    basketInfo?: string | undefined;
    shownPrices?: ShownPrices | undefined;
    busy?: boolean;
    onHighlight: (lineIds: readonly string[]) => void;
    onRemoveLine: (lineId: string) => void;
  }

  let {
    locale,
    order,
    labels,
    setMembers,
    highlightedLines,
    basketInfo,
    shownPrices,
    busy = false,
    onHighlight,
    onRemoveLine,
  }: Props = $props();

  const shippingLine = $derived(order.shippingLines.at(0));
  const shippingFree = $derived(
    shippingLine !== undefined && shippingLine.priceWithTax > 0 && order.shippingWithTax === 0
  );

  function badgesFor(line: OrderLine): string[] {
    const titles = (order.setDiscounts ?? [])
      .filter((entry) => entry.lines.some((member) => member.orderLineId === line.id))
      .map((entry) => entry.title);

    return [...new Set(titles)];
  }

  function linePriceChange(line: OrderLine): PriceChange | undefined {
    if (shownPrices === undefined) {
      return undefined;
    }

    return priceChange(line, shownPrices);
  }
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    <div class="flex flex-col gap-4">
      {#each order.lines as line (line.id)}
        <LineCard
          {locale}
          {line}
          currencyCode={order.currencyCode}
          {labels}
          partnerLinks={partnerLinks(line, order, setMembers)}
          priceChange={linePriceChange(line)}
          highlighted={highlightedLines.includes(line.id)}
          {busy}
          badges={badgesFor(line)}
          onRemove={() => onRemoveLine(line.id)}
        />
      {/each}

      <SetChips {locale} {order} {onHighlight} />

      {#if basketInfo}
        <div class="flex items-start gap-2 rounded-lg bg-brown-100 p-2 text-xs text-brown-600">
          <Icon icon="mdi:information-outline" class="mt-0.5 shrink-0" />
          <span>{basketInfo}</span>
        </div>
      {/if}

      <div class="flex flex-col gap-1 rounded-xl bg-brown-50 p-4 text-sm text-body">
        <div class="flex items-center justify-between gap-4">
          <span>{i18n.t("checkout.subtotal")}</span>
          <span>{formatMoney(order.subTotalWithTax, order.currencyCode)}</span>
        </div>
        <div class="flex items-center justify-between gap-4">
          <span>{i18n.t("checkout.shipping")}</span>
          <span class="text-right">
            {#if shippingLine === undefined}
              —
            {:else if shippingFree}
              <span class="mr-1 line-through opacity-60">
                {formatMoney(shippingLine.priceWithTax, order.currencyCode)}
              </span>
              {i18n.t("checkout.free")}
            {:else}
              {formatMoney(order.shippingWithTax, order.currencyCode)}
            {/if}
          </span>
        </div>
        <div class="mt-1 flex items-center justify-between gap-4 border-t border-brown-200 pt-2">
          <span class="text-lg font-medium uppercase">{i18n.t("checkout.total")}</span>
          <span data-testid="checkout-total" class="text-lg font-semibold text-dark">
            {formatMoney(order.totalWithTax, order.currencyCode)}
          </span>
        </div>
      </div>
    </div>
  {/snippet}
</I18nGate>
