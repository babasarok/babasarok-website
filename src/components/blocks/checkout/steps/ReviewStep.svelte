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
  import { FIELD } from "@/lib/basket/checkoutValues";
  import { translateMessage } from "@/lib/i18next-client";

  interface Props {
    locale: Locale;
    order: Order;
    labels: Labels;
    setMembers: SetMembers;
    highlightedLines: readonly string[];
    initialMessage: string;
    contactLines: string[];
    shippingLines: string[];
    billingLines: string[];
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
    contactLines,
    shippingLines,
    billingLines,
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

  const sections: { step: Exclude<StepId, "review">; lines: string[] }[] = $derived([
    { step: "contact", lines: contactLines },
    { step: "shipping", lines: shippingLines },
    { step: "billing", lines: billingLines },
  ]);
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    <form
      id="wizard-step-review"
      data-testid="step-review"
      class="flex flex-col gap-4 rounded-2xl border border-brown-200 bg-white p-4 sm:p-6"
      onchange={(event) => onSave(new FormData(event.currentTarget))}
      onsubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {#each sections as section (section.step)}
          <section
            class="flex flex-col gap-1.5 rounded-xl bg-brown-50 p-3"
            data-testid={`review-${section.step}`}
          >
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
            <ul class="flex flex-col text-sm text-body">
              {#each section.lines as line, index (index)}
                <li class="break-words">{line}</li>
              {/each}
            </ul>
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

      <textarea
        name={FIELD.message}
        rows="4"
        aria-label={i18n.t("checkout.messagePlaceholder")}
        placeholder={i18n.t("checkout.messagePlaceholder")}
        class="min-h-22 rounded border border-brown-200 bg-white p-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-sand-300/40"
        value={initialMessage}
      ></textarea>

      <label class="flex cursor-pointer items-start gap-2.5 text-sm text-body">
        <input
          type="checkbox"
          name={FIELD.terms}
          bind:checked={terms}
          required
          class="size-4 accent-accent"
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
