<script lang="ts">
  import OrderSummary from "./OrderSummary.svelte";
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
    hint: boolean;
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
    hint,
    basketInfo,
    shownPrices,
    busy = false,
    onHighlight,
    onRemoveLine,
  }: Props = $props();
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    <!-- TODO: factor out header height (100px) -->
    <aside class="hidden lg:sticky lg:top-25 lg:block" data-testid="summary-column">
      <div class="flex flex-col gap-4 rounded-2xl border border-brown-200 bg-white p-6 shadow-sm">
        <h2 class="text-2xl font-bold text-headings">{i18n.t("checkout.summaryTitle")}</h2>
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
        {#if hint}
          <p class="text-sm italic text-brown-500">{i18n.t("checkout.summaryHint")}</p>
        {/if}
      </div>
    </aside>
  {/snippet}
</I18nGate>
