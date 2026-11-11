<script lang="ts">
  import Icon from "@iconify/svelte";
  import Button from "@/components/ui/Button.svelte";
  import OrderSummary from "@/components/blocks/checkout/summary/OrderSummary.svelte";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import type { i18n as I18n } from "i18next";
  import type { Locale } from "@/lib/i18n";
  import type { Labels } from "@/lib/basket/lineRows";
  import type { Order } from "@/lib/basket/schemas";
  import type { SetMembers } from "@/lib/basket/setDiscounts";
  import type { ShownPrices } from "@/lib/basket/stale";
  import type { StepId } from "@/lib/basket/steps";
  import type { DetailRow } from "@/lib/basket/summaryText";
  import { FIELD } from "@/lib/basket/checkoutValues";
  import { translateMessage } from "@/lib/i18next-client";

  interface Props {
    locale: Locale;
    order: Order;
    labels: Labels;
    setMembers: SetMembers;
    highlightedLines: readonly string[];
    initialMessage: string;
    contactRows: DetailRow[];
    shippingRows: DetailRow[];
    billingRows: DetailRow[];
    total: string;
    terms: boolean;
    error: string | null;
    sending: boolean;
    submitDisabled: boolean;
    onBack: () => void;
    onEdit: (step: StepId) => void;
    onSave: (data: FormData) => void;
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
    initialMessage,
    contactRows,
    shippingRows,
    billingRows,
    total,
    terms = $bindable(false),
    error,
    sending,
    submitDisabled,
    onBack,
    onEdit,
    onSave,
    onSubmit,
    supportEmail,
    basketInfo,
    shownPrices,
    busy = false,
    onHighlight,
    onRemoveLine,
  }: Props = $props();

  type ReviewedStep = Exclude<StepId, "review">;

  const ICONS: Record<ReviewedStep, string> = {
    contact: "mdi:account-outline",
    shipping: "mdi:truck-outline",
    billing: "mdi:file-document-outline",
  };

  const sections: { step: ReviewedStep; rows: DetailRow[] }[] = $derived([
    { step: "contact", rows: contactRows },
    { step: "shipping", rows: shippingRows },
    { step: "billing", rows: billingRows },
  ]);
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    <form
      id="wizard-step-review"
      data-testid="step-review"
      class="flex flex-col gap-4 rounded-2xl border border-brown-200 bg-white p-4 sm:p-6 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0"
      onchange={(event) => onSave(new FormData(event.currentTarget))}
      onsubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div class="flex flex-col divide-y divide-brown-100 rounded-xl bg-brown-50 px-4">
        {#each sections as section (section.step)}
          <section class="flex gap-3 py-3" data-testid={`review-${section.step}`}>
            <Icon icon={ICONS[section.step]} class="mt-0.5 shrink-0 text-xl text-brown-500" />
            <div class="flex min-w-0 flex-1 flex-col gap-1.5">
              <div class="flex items-baseline justify-between gap-2">
                <h3 class="text-sm font-semibold text-headings">
                  {i18n.t(`checkout.steps.${section.step}`)}
                </h3>
                <button
                  type="button"
                  class="cursor-pointer text-xs text-brown-600 underline hover:text-brown-700"
                  onclick={() => onEdit(section.step)}
                >
                  {i18n.t("checkout.modify")}
                </button>
              </div>
              <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
                {#each section.rows as row, index (index)}
                  <dt class="text-brown-600">{row.label}</dt>
                  <dd class="min-w-0 break-words text-body">{row.value}</dd>
                {/each}
              </dl>
            </div>
          </section>
        {/each}
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

      <div class="flex flex-col gap-1">
        <label for="review-message" class="text-sm font-medium text-body">
          {i18n.t("checkout.messageLabel")}
        </label>
        <textarea
          id="review-message"
          name={FIELD.message}
          rows="4"
          placeholder={i18n.t("checkout.messagePlaceholder")}
          class="min-h-22 rounded border border-brown-200 bg-white p-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-sand-300/40"
          value={initialMessage}
        ></textarea>
      </div>

      <div class="flex items-start gap-2 rounded border border-warning-400 bg-warning-50 p-2">
        <Icon icon="mdi:info" class="shrink-0 text-2xl text-warning-500" />
        <p class="text-xs text-warning-800">
          {i18n.t("checkout.testingNotice")}
          <a
            class="underline hover:text-brown-700"
            href={`mailto:${supportEmail ?? ""}?subject=Babasarok rendelési probléma&body=Kérlek, írd le a problémát, ha lehet screenshot-tal együtt.&cc=attilagreguss@protonmail.com`}
            >{i18n.t("checkout.testingNoticeLink")}</a
          >.
        </p>
      </div>

      <div
        class="hidden items-baseline justify-between gap-4 border-t border-brown-200 pt-3 lg:flex"
      >
        <span class="text-lg font-medium uppercase">{i18n.t("checkout.total")}</span>
        <span class="text-xl font-semibold text-dark" data-testid="review-total">{total}</span>
      </div>

      <p class="flex items-start gap-1.5 text-sm text-brown-600">
        <Icon icon="mdi:email-check-outline" class="mt-0.5 shrink-0" />
        {i18n.t("checkout.nextSteps")}
      </p>

      {#if error}
        <p
          id="checkout-error"
          role="alert"
          class="flex items-start gap-1.5 rounded-lg bg-danger-500/10 p-2 text-sm text-danger-500"
          data-testid="checkout-error"
        >
          <Icon icon="mdi:alert-circle" class="mt-0.5 shrink-0" />
          {translateMessage(i18n, error)}
        </p>
      {/if}

      <label class="flex cursor-pointer items-start gap-2.5 text-sm text-body">
        <input
          type="checkbox"
          name={FIELD.terms}
          bind:checked={terms}
          required
          class="mt-0.5 size-4 accent-accent"
        />
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
          class="flex h-11 items-center gap-2 px-6 uppercase"
          disabled={submitDisabled || sending}
          aria-busy={sending}
          data-testid="place-order"
        >
          {#if sending}
            <Icon icon="mdi:loading" class="animate-spin text-lg" />
          {/if}
          {i18n.t("checkout.placeOrder")}
        </Button>
      </div>
    </form>
  {/snippet}
</I18nGate>
