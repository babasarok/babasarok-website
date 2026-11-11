<script lang="ts">
  import OrderSummary from "@/components/blocks/checkout/summary/OrderSummary.svelte";
  import type { Locale } from "@/lib/i18n";
  import type { Labels } from "@/lib/basket/lineRows";
  import type { Order } from "@/lib/basket/schemas";
  import type { SetMembers } from "@/lib/basket/setDiscounts";
  import type { ShownPrices } from "@/lib/basket/stale";

  interface Props {
    locale: Locale;
    order: Order;
    labels: Labels;
    setMembers: SetMembers;
    highlightedLines: readonly string[];
    basketInfo?: string | undefined;
    shownPrices?: ShownPrices | undefined;
    busy?: boolean;
    onContinue: () => void;
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
    onContinue,
    onHighlight,
    onRemoveLine,
  }: Props = $props();
</script>

<form
  id="wizard-step-basket"
  data-testid="step-basket"
  class="rounded-2xl border border-brown-200 bg-white p-4 sm:p-6"
  onsubmit={(event) => {
    event.preventDefault();
    onContinue();
  }}
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
</form>
