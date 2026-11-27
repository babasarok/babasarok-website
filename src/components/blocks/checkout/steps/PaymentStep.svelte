<script lang="ts">
  import Icon from "@iconify/svelte";
  import Button from "@/components/ui/ActionButton.svelte";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import type { i18n as I18n } from "i18next";
  import type { Locale } from "@/lib/i18n";
  import { PAYMENT_METHODS, type PaymentMethodId } from "@/lib/basket/barion";
  import { FIELD } from "@/lib/basket/checkoutValues";

  interface Props {
    locale: Locale;
    initial: PaymentMethodId | undefined;
    pending: boolean;
    onBack: (() => void) | undefined;
    /** The pending order skips the review: the continue button pays directly. */
    payNow: boolean;
    onSelect: (payment: PaymentMethodId) => void;
    onContinue: (data: FormData) => void;
  }

  let { locale, initial, pending, onBack, onSelect, onContinue, payNow }: Props = $props();

  function onChange(event: Event): void {
    if (event.target instanceof HTMLInputElement && event.target.name === FIELD.paymentMethod) {
      onSelect(event.target.value === "barion" ? "barion" : "bank-transfer");
    }
  }
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    <form
      id="wizard-step-payment"
      data-testid="step-payment"
      class="flex flex-col gap-4 rounded-2xl border border-brown-200 bg-white p-4 sm:p-6 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0"
      onchange={onChange}
      onsubmit={(event) => {
        event.preventDefault();
        onContinue(new FormData(event.currentTarget));
      }}
    >
      <div
        class="flex flex-col gap-2"
        role="radiogroup"
        aria-label={i18n.t("checkout.payment.label")}
      >
        {#each PAYMENT_METHODS as option (option)}
          <label
            class="flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 text-sm transition-all {initial ===
            option
              ? 'border-brown-600 bg-brown-50 ring-1 ring-brown-500'
              : 'border-brown-200 bg-white hover:border-brown-400'}"
          >
            <input
              type="radio"
              name={FIELD.paymentMethod}
              value={option}
              data-testid={`payment-${option}`}
              class="mt-0.5 size-4 shrink-0 accent-accent"
              checked={option === initial}
            />
            <span class="flex min-w-0 flex-col gap-1">
              <span class="font-medium text-body">{i18n.t(`checkout.payment.${option}`)}</span>
              <span class="text-brown-600">{i18n.t(`checkout.payment.${option}Note`)}</span>
            </span>
          </label>
        {/each}
      </div>

      <p class="flex items-center gap-1.5 text-xs text-brown-600 italic">
        <Icon icon="mdi:information-outline" class="shrink-0" />
        {i18n.t("checkout.payment.hint")}
      </p>

      <div class="mt-2 hidden items-center justify-between gap-3 lg:flex">
        {#if onBack !== undefined}
          <Button type="button" variant="outlined" class="h-11 px-6" onclick={onBack}>
            {i18n.t("checkout.back")}
          </Button>
        {:else}
          <span></span>
        {/if}

        <Button
          type="submit"
          variant="contained"
          class="flex h-11 flex-nowrap items-center gap-2 px-6 uppercase"
          disabled={pending}
          aria-busy={pending}
        >
          {i18n.t(payNow ? "checkout.payment.pay" : "checkout.continueReview")}
          <Icon
            icon={pending ? "mdi:loading" : "mdi:arrow-right"}
            class="text-lg {pending ? 'animate-spin' : ''}"
          />
        </Button>
      </div>
    </form>
  {/snippet}
</I18nGate>
