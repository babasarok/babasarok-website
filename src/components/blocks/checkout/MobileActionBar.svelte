<script lang="ts">
  import Icon from "@iconify/svelte";
  import { slide } from "svelte/transition";
  import Button from "@/components/ui/Button.svelte";
  import OrderSummary from "@/components/blocks/checkout/summary/OrderSummary.svelte";
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
    backVisible: boolean;
    onBack: () => void;
    nextLabel: string;
    nextDisabled: boolean;
    formId: string;
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
    backVisible,
    onBack,
    nextLabel,
    nextDisabled,
    formId,
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
        class="flex items-center gap-2 border-t border-brown-200 bg-white px-3 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] shadow-[0_-8px_24px_rgba(52,58,64,0.15)]"
      >
        {#if backVisible}
          <Button
            type="button"
            variant="outlined"
            class="h-11 shrink-0 px-3"
            onclick={onBack}
            data-testid="wizard-back"
          >
            {i18n.t("checkout.back")}
          </Button>
        {/if}

        <button
          type="button"
          aria-label={i18n.t("checkout.summaryTitle")}
          aria-expanded={expanded}
          aria-controls="checkout-summary-mobile"
          onclick={toggle}
          class="mx-auto cursor-pointer rounded-full p-2 text-brown-600 transition-colors hover:bg-brown-100"
        >
          <Icon icon={expanded ? "mdi:chevron-down" : "mdi:chevron-up"} class="text-2xl" />
        </button>

        <Button
          type="submit"
          form={formId}
          variant="contained"
          class="h-11 shrink-0 px-3 uppercase"
          disabled={nextDisabled}
          data-testid="wizard-next"
        >
          {nextLabel}
        </Button>
      </div>
    </div>
  {/snippet}
</I18nGate>
