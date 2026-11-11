<script lang="ts">
  import Icon from "@iconify/svelte";
  import Button from "@/components/ui/Button.svelte";
  import OrderSummary from "@/components/blocks/checkout/summary/OrderSummary.svelte";
  import StepSummary from "@/components/blocks/checkout/wizard/StepSummary.svelte";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import type { i18n as I18n } from "i18next";
  import type { Locale } from "@/lib/i18n";
  import type { Labels } from "@/lib/basket/lineRows";
  import type { Order } from "@/lib/basket/schemas";
  import type { SetMembers } from "@/lib/basket/setDiscounts";
  import type { ShownPrices } from "@/lib/basket/stale";
  import type { StepId } from "@/lib/basket/steps";
  import { translateMessage } from "@/lib/i18next-client";

  interface Props {
    locale: Locale;
    order: Order;
    labels: Labels;
    setMembers: SetMembers;
    highlightedLines: readonly string[];
    contactSummary: string;
    shippingSummary: string;
    billingSummary: string;
    terms: boolean;
    error: string | null;
    sending: boolean;
    submitDisabled: boolean;
    onBack: () => void;
    onEdit: (step: StepId) => void;
    onSubmit: () => void;
    supportEmail: string | null | undefined;
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
    contactSummary,
    shippingSummary,
    billingSummary,
    terms = $bindable(false),
    error,
    sending,
    submitDisabled,
    onBack,
    onEdit,
    onSubmit,
    supportEmail,
    basketInfo,
    shownPrices,
    busy = false,
    onHighlight,
    onRemoveLine,
  }: Props = $props();
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    <form
      id="wizard-step-review"
      data-testid="step-review"
      class="flex flex-col gap-4 rounded-2xl border border-brown-200 bg-white p-4 sm:p-6"
      onsubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div class="flex flex-col gap-2">
        <StepSummary
          {locale}
          title={i18n.t("checkout.steps.contact")}
          summary={contactSummary}
          onEdit={() => onEdit("contact")}
        />
        <StepSummary
          {locale}
          title={i18n.t("checkout.steps.shipping")}
          summary={shippingSummary}
          onEdit={() => onEdit("shipping")}
        />
        <StepSummary
          {locale}
          title={i18n.t("checkout.steps.billing")}
          summary={billingSummary}
          onEdit={() => onEdit("billing")}
        />
      </div>

      <div class="lg:hidden">
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

      <div class="flex items-start gap-2 rounded border border-gray-300 bg-brown-100 p-2">
        <Icon icon="mdi:info" class="shrink-0 text-2xl text-yellow-500" />
        <p class="text-xs text-yellow-700">
          {i18n.t("checkout.testingNotice")}
          <a
            class="text-yellow-700 underline hover:text-yellow-900"
            href={`mailto:${supportEmail ?? ""}?subject=Babasarok rendelési probléma&body=Kérlek, írd le a problémát, ha lehet screenshot-tal együtt.&cc=attilagreguss@protonmail.com`}
            >{i18n.t("checkout.testingNoticeLink")}</a
          >.
        </p>
      </div>

      {#if error}
        <p class="text-sm text-danger-500" data-testid="checkout-error">
          {translateMessage(i18n, error)}
        </p>
      {/if}

      <label class="flex cursor-pointer items-start gap-2.5 text-sm text-body">
        <input type="checkbox" bind:checked={terms} required class="size-4 accent-accent" />
        <span>
          {i18n.t("checkout.termsPrefix")}
          <a href="/terms" target="_blank" rel="noopener" class="underline hover:text-brown-700"
            >{i18n.t("checkout.termsLink")}</a
          >
        </span>
      </label>

      <div class="hidden items-center justify-between gap-3 lg:flex">
        <Button type="button" variant="outlined" class="h-11 px-6" onclick={onBack}>
          {i18n.t("checkout.back")}
        </Button>

        <Button
          type="submit"
          variant="contained"
          class="h-11 px-6 uppercase"
          disabled={submitDisabled || sending}
          data-testid="place-order"
        >
          {i18n.t("checkout.placeOrder")}
        </Button>
      </div>
    </form>
  {/snippet}
</I18nGate>
