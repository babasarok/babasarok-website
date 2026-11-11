<script lang="ts">
  import Icon from "@iconify/svelte";
  import Button from "@/components/ui/Button.svelte";
  import TextInput from "@/components/ui/TextInput.svelte";
  import AddressFields from "./AddressFields.svelte";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import type { i18n as I18n } from "i18next";
  import type { Locale } from "@/lib/i18n";
  import type { BillingDraft } from "@/lib/basket/drafts";
  import type { FieldCheck } from "@/lib/basket/readiness";
  import { requiresAddress, type ShippingQuote } from "@/lib/basket/schemas";

  interface Props {
    locale: Locale;
    billing: BillingDraft;
    method: ShippingQuote | undefined;
    error?: FieldCheck | undefined;
    onContinue: () => void;
    onBack: () => void;
  }

  let { locale, billing, method, error, onContinue, onBack }: Props = $props();

  const pickup = $derived(!requiresAddress(method));
  const showAddress = $derived(pickup || !billing.sameAsShipping);
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    <form
      data-testid="step-billing"
      class="flex flex-col gap-4 rounded-2xl border border-brown-200 bg-white p-4 sm:p-6"
      onsubmit={(event) => {
        event.preventDefault();
        onContinue();
      }}
    >
      <h2 class="text-2xl font-bold text-headings">{i18n.t("checkout.steps.billing")}</h2>

      {#if !pickup}
        <label class="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-body">
          <input
            type="checkbox"
            data-testid="billing-same-toggle"
            bind:checked={billing.sameAsShipping}
            class="size-4 accent-accent"
          />
          {i18n.t("checkout.sameAsShipping")}
        </label>
      {:else}
        <p class="text-xs text-brown-600 italic">{i18n.t("checkout.pickupBillingNote")}</p>
      {/if}

      {#if showAddress}
        <AddressFields {locale} address={billing.address} {error} idPrefix="billing" />
      {/if}

      <div class="flex flex-col gap-3 rounded-xl bg-brown-50 p-3">
        <p class="text-xs text-brown-600">{i18n.t("checkout.companyGroupLabel")}</p>

        <div class="flex flex-col gap-1">
          <label for="billing-company" class="text-sm font-medium text-body">
            {i18n.t("checkout.company")}
          </label>
          <TextInput
            id="billing-company"
            type="text"
            autocomplete="organization"
            bind:value={billing.company}
          />
        </div>

        <div class="flex flex-col gap-1">
          <label for="billing-taxNumber" class="text-sm font-medium text-body">
            {i18n.t("checkout.taxNumber")}
          </label>
          <TextInput id="billing-taxNumber" type="text" bind:value={billing.taxNumber} />
        </div>
      </div>

      <div class="mt-2 flex items-center justify-between gap-3">
        <Button type="button" variant="outlined" class="h-8 px-2" onclick={onBack}>
          {i18n.t("checkout.back")}
        </Button>

        <Button
          type="submit"
          variant="contained"
          class="h-8 px-2 uppercase flex flex-nowrap items-center"
        >
          {i18n.t("checkout.continueReview")}
          <Icon icon="mdi:arrow-right" class="ml-2 text-lg" />
        </Button>
      </div>
    </form>
  {/snippet}
</I18nGate>
