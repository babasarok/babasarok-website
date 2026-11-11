<script lang="ts">
  import Icon from "@iconify/svelte";
  import Button from "@/components/ui/Button.svelte";
  import AddressFields from "./AddressFields.svelte";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import type { i18n as I18n } from "i18next";
  import type { Locale } from "@/lib/i18n";
  import type { AddressDraft } from "@/lib/basket/drafts";
  import { formatMoney } from "@/lib/basket/money";
  import { selectedMethod, type FieldCheck } from "@/lib/basket/readiness";
  import { requiresAddress, type ShippingQuote } from "@/lib/basket/schemas";
  import { translateMessage } from "@/lib/i18next-client";

  interface Props {
    locale: Locale;
    address: AddressDraft;
    methods: ShippingQuote[];
    shippingMethodId: string;
    error?: FieldCheck | undefined;
    onContinue: () => void;
    onBack: () => void;
    onCountryChange: () => Promise<void>;
    methodsLoading: boolean;
  }

  let {
    locale,
    address,
    methods,
    shippingMethodId = $bindable(""),
    error,
    onContinue,
    onBack,
    onCountryChange,
    methodsLoading,
  }: Props = $props();

  const method = $derived(selectedMethod(methods, shippingMethodId));
  const showAddress = $derived(requiresAddress(method));
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    <form
      data-testid="step-shipping"
      class="flex flex-col gap-4 rounded-2xl border border-brown-200 bg-white p-4 sm:p-6"
      onsubmit={(event) => {
        event.preventDefault();
        onContinue();
      }}
    >
      <h2 class="text-2xl font-bold text-headings">{i18n.t("checkout.steps.shipping")}</h2>

      <div class="flex flex-col gap-2" role="radiogroup" aria-label={i18n.t("checkout.shipping")}>
        {#if methodsLoading}
          {#each Array.from({ length: 3 }) as _, index (index)}
            <div class="h-12 animate-pulse rounded-lg border border-brown-200 bg-brown-100"></div>
          {/each}
        {:else}
          {#each methods as option (option.id)}
            <label
              class="flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-all {shippingMethodId ===
              option.id
                ? "border-brown-600 bg-brown-50 ring-1 ring-brown-500"
                : "border-brown-200 bg-white hover:border-brown-400"}"
            >
              <input
                type="radio"
                name="shipping-method"
                value={option.id}
                data-testid={`method-${option.id}`}
                class="size-4 shrink-0 accent-accent"
                bind:group={shippingMethodId}
              />
              <span class="font-medium text-body">{option.name}</span>
              <span class="text-body">·</span>
              <span class="text-body">{formatMoney(option.priceWithTax, "HUF")}</span>
            </label>
          {/each}
        {/if}
      </div>

      {#if error?.field === "method"}
        <p class="text-sm text-danger-500" role="alert">
          {translateMessage(i18n, error.message)}
        </p>
      {/if}

      {#if showAddress}
        <div class="flex flex-col gap-2">
          <AddressFields {locale} {address} {error} idPrefix="shipping" {onCountryChange} />

          <p class="flex items-center gap-1.5 text-xs text-brown-600 italic">
            <Icon icon="mdi:information-outline" class="shrink-0" />
            {i18n.t("checkout.addressNote")}
          </p>
        </div>
      {/if}

      <div class="mt-2 flex items-center justify-between gap-3">
        <Button type="button" variant="outlined" class="h-11 px-6" onclick={onBack}>
          {i18n.t("checkout.back")}
        </Button>

        <Button type="submit" variant="contained" class="h-11 px-6 uppercase">
          {i18n.t("checkout.continueBilling")}
          <Icon icon="mdi:arrow-right" class="ml-2 text-lg" />
        </Button>
      </div>
    </form>
  {/snippet}
</I18nGate>
