<script lang="ts">
  import Icon from "@iconify/svelte";
  import Button from "@/components/ui/Button.svelte";
  import TextInput from "@/components/ui/TextInput.svelte";
  import AddressFields from "./AddressFields.svelte";
  import Collapse from "@/components/blocks/checkout/wizard/Collapse.svelte";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import type { i18n as I18n } from "i18next";
  import type { Locale } from "@/lib/i18n";
  import { FIELD, type BillingValues } from "@/lib/basket/checkoutValues";
  import type { FieldCheck } from "@/lib/basket/readiness";
  import { requiresAddress, type ShippingQuote } from "@/lib/basket/schemas";
  import { translateMessage } from "@/lib/i18next-client";

  interface Props {
    locale: Locale;
    initial: BillingValues;
    method: ShippingQuote | undefined;
    error?: FieldCheck | undefined;
    onSave: (data: FormData) => void;
    onContinue: (data: FormData) => void;
    onBack: () => void;
  }

  let { locale, initial, method, error, onSave, onContinue, onBack }: Props = $props();

  function seed(): boolean {
    return initial.sameAsShipping;
  }

  let sameAsShipping = $state(seed());

  const pickup = $derived(!requiresAddress(method));
  const showAddress = $derived(pickup || !sameAsShipping || error !== undefined);
  const nameError = $derived(error?.field === "fullName");
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    <form
      id="wizard-step-billing"
      data-testid="step-billing"
      class="flex flex-col gap-4 rounded-2xl border border-brown-200 bg-white p-4 sm:p-6"
      onchange={(event) => onSave(new FormData(event.currentTarget))}
      onsubmit={(event) => {
        event.preventDefault();
        onContinue(new FormData(event.currentTarget));
      }}
    >
      {#if !pickup}
        <label class="flex cursor-pointer items-center gap-2.5 text-sm font-medium text-body">
          <input
            type="checkbox"
            name={FIELD.sameAsShipping}
            data-testid="billing-same-toggle"
            bind:checked={sameAsShipping}
            class="size-4 accent-accent"
          />
          {i18n.t("checkout.sameAsShipping")}
        </label>
      {/if}

      <Collapse open={showAddress}>
        <div class="flex flex-col gap-3 pt-2">
          {#if pickup}
            <p class="text-xs text-brown-600 italic">{i18n.t("checkout.pickupBillingNote")}</p>
          {/if}

          <div class="flex flex-col gap-1">
            <label for="billing-fullName" class="text-sm font-medium text-body">
              {i18n.t("checkout.fullName")}
            </label>
            <TextInput
              id="billing-fullName"
              name={FIELD.fullName}
              type="text"
              autocomplete="billing name"
              aria-invalid={nameError}
              aria-describedby={nameError ? "billing-fullName-error" : undefined}
              class={nameError ? "border-danger-500" : ""}
              value={initial.fullName}
            />
            {#if nameError && error}
              <p
                id="billing-fullName-error"
                class="flex items-center gap-1 text-xs text-danger-500"
              >
                <Icon icon="mdi:alert-circle-outline" class="size-3.5 shrink-0" />
                <span>{translateMessage(i18n, error.message)}</span>
              </p>
            {/if}
          </div>

          <AddressFields
            {locale}
            initial={initial.address}
            section="billing"
            idPrefix="billing"
            {error}
          />
        </div>
      </Collapse>

      <div class="flex flex-col gap-3 rounded-xl bg-brown-50 p-3">
        <p class="text-xs text-brown-600">{i18n.t("checkout.companyGroupLabel")}</p>

        <div class="flex flex-col gap-1">
          <label for="billing-company" class="text-sm font-medium text-body">
            {i18n.t("checkout.company")}
          </label>
          <TextInput
            id="billing-company"
            name={FIELD.company}
            type="text"
            autocomplete="organization"
            value={initial.company}
          />
        </div>

        <div class="flex flex-col gap-1">
          <label for="billing-taxNumber" class="text-sm font-medium text-body">
            {i18n.t("checkout.taxNumber")}
          </label>
          <TextInput
            id="billing-taxNumber"
            name={FIELD.taxNumber}
            type="text"
            autocomplete="off"
            value={initial.taxNumber}
          />
        </div>
      </div>

      <div class="mt-2 hidden items-center justify-between gap-3 lg:flex">
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
