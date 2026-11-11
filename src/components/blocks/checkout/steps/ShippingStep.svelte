<script lang="ts">
  import Icon from "@iconify/svelte";
  import Button from "@/components/ui/Button.svelte";
  import AddressFields from "./AddressFields.svelte";
  import Collapse from "@/components/blocks/checkout/wizard/Collapse.svelte";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import type { i18n as I18n } from "i18next";
  import type { Locale } from "@/lib/i18n";
  import type { AddressValues } from "@/lib/basket/checkoutValues";
  import { formatMoney } from "@/lib/basket/money";
  import { selectedMethod, type FieldCheck } from "@/lib/basket/readiness";
  import { requiresAddress, type ShippingQuote } from "@/lib/basket/schemas";
  import { translateMessage } from "@/lib/i18next-client";

  interface Props {
    locale: Locale;
    initial: AddressValues;
    methods: ShippingQuote[];
    selectedId: string | undefined;
    methodPending: boolean;
    currencyCode: string;
    error?: FieldCheck | undefined;
    onMethod: (shippingMethodId: string) => void;
    onSave: (data: FormData) => void;
    onContinue: (data: FormData) => void;
    onBack: () => void;
  }

  let {
    locale,
    initial,
    methods,
    selectedId,
    methodPending,
    currencyCode,
    error,
    onMethod,
    onSave,
    onContinue,
    onBack,
  }: Props = $props();

  const METHOD_INPUT = "shippingMethod";

  const method = $derived(selectedMethod(methods, selectedId));
  const addressError = $derived(error !== undefined && error.field !== "method");
  const showAddress = $derived(requiresAddress(method) || addressError);

  function onChange(event: Event & { currentTarget: HTMLFormElement }): void {
    if (event.target instanceof HTMLInputElement && event.target.name === METHOD_INPUT) {
      return;
    }

    onSave(new FormData(event.currentTarget));
  }
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    <form
      id="wizard-step-shipping"
      data-testid="step-shipping"
      class="flex flex-col gap-4 rounded-2xl border border-brown-200 bg-white p-4 sm:p-6"
      onchange={onChange}
      onsubmit={(event) => {
        event.preventDefault();
        onContinue(new FormData(event.currentTarget));
      }}
    >
      <div class="flex flex-col gap-2" role="radiogroup" aria-label={i18n.t("checkout.shipping")}>
        {#each methods as option (option.id)}
          <label
            class="flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-all {selectedId ===
            option.id
              ? 'border-brown-600 bg-brown-50 ring-1 ring-brown-500'
              : 'border-brown-200 bg-white hover:border-brown-400'}"
          >
            <input
              type="radio"
              name={METHOD_INPUT}
              value={option.id}
              data-testid={`method-${option.id}`}
              class="size-4 shrink-0 accent-accent"
              checked={option.id === selectedId}
              disabled={methodPending}
              onchange={() => onMethod(option.id)}
            />
            <span class="font-medium text-body">{option.name}</span>
            <span class="text-body">·</span>
            <span class="text-body">{formatMoney(option.priceWithTax, currencyCode)}</span>
          </label>
        {/each}
      </div>

      {#if error?.field === "method"}
        <p class="text-sm text-danger-500" role="alert">
          {translateMessage(i18n, error.message)}
        </p>
      {/if}

      <Collapse open={showAddress}>
        <div class="flex flex-col gap-2 pt-2">
          <AddressFields {locale} {initial} section="shipping" idPrefix="shipping" {error} />

          <p class="flex items-center gap-1.5 text-xs text-brown-600 italic">
            <Icon icon="mdi:information-outline" class="shrink-0" />
            {i18n.t("checkout.addressNote")}
          </p>
        </div>
      </Collapse>

      <div class="mt-2 hidden items-center justify-between gap-3 lg:flex">
        <Button type="button" variant="outlined" class="h-8 px-2" onclick={onBack}>
          {i18n.t("checkout.back")}
        </Button>

        <Button
          type="submit"
          variant="contained"
          class="h-8 px-2 uppercase flex flex-nowrap items-center"
        >
          {i18n.t("checkout.continueBilling")}
          <Icon icon="mdi:arrow-right" class="ml-2 text-lg" />
        </Button>
      </div>
    </form>
  {/snippet}
</I18nGate>
