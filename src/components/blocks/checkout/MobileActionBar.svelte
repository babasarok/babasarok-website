<script lang="ts">
  import Icon from "@iconify/svelte";
  import Button from "@/components/ui/Button.svelte";
  import Sheet from "@/components/ui/Sheet.svelte";
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
    pending: boolean;
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
    pending,
    formId,
    basketInfo,
    shownPrices,
    busy = false,
    onHighlight,
    onRemoveLine,
  }: Props = $props();

  let expanded = $state(false);

  function back(): void {
    expanded = false;
    onBack();
  }
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    {#snippet controls()}
      <div class="flex items-center gap-2">
        {#if backVisible}
          <Button
            type="button"
            variant="outlined"
            class="h-11 shrink-0 px-3"
            onclick={back}
            data-testid="wizard-back"
          >
            {i18n.t("checkout.back")}
          </Button>
        {/if}

        <button
          type="button"
          aria-label={i18n.t("checkout.summaryTitle")}
          aria-expanded={expanded}
          onclick={() => (expanded = !expanded)}
          data-testid="summary-toggle"
          class="relative mx-auto flex cursor-pointer items-center gap-0.5 rounded-full p-2 text-brown-600 transition-colors hover:bg-brown-100"
        >
          <Icon icon="mdi:cart-outline" class="text-2xl" />
          <Icon icon={expanded ? "mdi:chevron-down" : "mdi:chevron-up"} class="text-lg" />
          <span
            class="absolute -top-0.5 left-6 flex h-5 min-w-5 items-center justify-center rounded-full bg-sand-300 px-1 text-xs font-medium text-white"
          >
            {order.totalQuantity}
          </span>
        </button>

        <Button
          type="submit"
          form={formId}
          variant="contained"
          class="flex h-11 shrink-0 items-center gap-2 px-4 uppercase"
          disabled={nextDisabled || pending}
          aria-busy={pending}
          onclick={() => (expanded = false)}
          data-testid="wizard-next"
        >
          {#if pending}
            <Icon icon="mdi:loading" class="animate-spin text-lg" />
          {/if}
          {nextLabel}
        </Button>
      </div>
    {/snippet}

    <div
      class="fixed inset-x-0 bottom-0 z-40 border-t border-brown-200 bg-white px-3 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] shadow-[0_-8px_24px_rgba(52,58,64,0.15)] lg:hidden"
    >
      {@render controls()}
    </div>

    <Sheet
      open={expanded}
      aria-label={i18n.t("checkout.summaryTitle")}
      onOpenChange={(open) => (expanded = open)}
    >
      {#snippet content()}
        <div class="flex flex-col gap-4">
          <h2 class="text-lg font-bold text-headings">{i18n.t("checkout.summaryTitle")}</h2>
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
          <div
            class="sticky -bottom-5 -mx-5 border-t border-brown-200 bg-light px-3 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
          >
            {@render controls()}
          </div>
        </div>
      {/snippet}
    </Sheet>
  {/snippet}
</I18nGate>
