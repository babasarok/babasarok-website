<script lang="ts">
  import Icon from "@iconify/svelte";
  import { slide } from "svelte/transition";
  import OrderSummary from "./OrderSummary.svelte";
  import { formatMoney } from "@/lib/basket/money";
  import type { Labels } from "@/lib/basket/lineRows";
  import type { Order } from "@/lib/basket/schemas";
  import type { SetMembers } from "@/lib/basket/setDiscounts";
  import type { ShownPrices } from "@/lib/basket/stale";
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

  let expanded = $state(false);

  function toggle(): void {
    expanded = !expanded;
  }
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    <div class="fixed inset-x-0 bottom-0 z-40 lg:hidden">
      {#if expanded}
        <div
          id="checkout-summary-mobile"
          transition:slide={{ duration: 200 }}
          class="max-h-[60vh] overflow-y-auto border-t border-brown-200 bg-white p-4 shadow-[0_-8px_24px_rgba(52,58,64,0.15)]"
        >
          <OrderSummary
            {locale}
            {order}
            {labels}
            {setMembers}
            {highlightedLines}
            {basketInfo}
            {shownPrices}
            {busy}
            {onHighlight}
            {onRemoveLine}
          />
        </div>
      {/if}

      <div
        class="flex items-center justify-between gap-3 border-t border-brown-200 bg-white px-4 py-3 shadow-[0_-8px_24px_rgba(52,58,64,0.15)]"
      >
        <span class="text-sm text-body">{i18n.t("checkout.total")}</span>
        <div class="flex items-center gap-2">
          <span data-testid="checkout-total-mobile" class="text-lg font-semibold text-dark">
            {formatMoney(order.totalWithTax, order.currencyCode)}
          </span>
          <button
            type="button"
            aria-label={i18n.t("checkout.summaryTitle")}
            aria-expanded={expanded}
            aria-controls="checkout-summary-mobile"
            onclick={toggle}
            class="cursor-pointer rounded-full p-1 text-brown-600 transition-colors hover:bg-brown-100"
          >
            <Icon icon={expanded ? "mdi:chevron-down" : "mdi:chevron-up"} class="text-2xl" />
          </button>
        </div>
      </div>
    </div>
  {/snippet}
</I18nGate>
