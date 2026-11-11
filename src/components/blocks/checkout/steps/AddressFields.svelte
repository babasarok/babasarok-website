<script lang="ts">
  import Icon from "@iconify/svelte";
  import TextInput from "@/components/ui/TextInput.svelte";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import type { i18n as I18n } from "i18next";
  import type { Locale } from "@/lib/i18n";
  import { FIELD, type AddressValues } from "@/lib/basket/checkoutValues";
  import type { FieldCheck } from "@/lib/basket/readiness";
  import { translateMessage } from "@/lib/i18next-client";

  interface Props {
    locale: Locale;
    initial: AddressValues;
    section: "shipping" | "billing";
    idPrefix: string;
    error?: FieldCheck | undefined;
  }

  let { locale, initial, section, idPrefix, error }: Props = $props();

  function errorFor(field: string): FieldCheck | undefined {
    return error?.field === field ? error : undefined;
  }

  function hasError(field: string): boolean {
    return error?.field === field;
  }
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    {#snippet errorText(check: FieldCheck | undefined, id: string)}
      {#if check}
        <p {id} class="flex items-center gap-1 text-xs text-danger-500">
          <Icon icon="mdi:alert-circle-outline" class="size-3.5 shrink-0" />
          <span>{translateMessage(i18n, check.message)}</span>
        </p>
      {/if}
    {/snippet}

    <div class="flex flex-col gap-3">
      <div class="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-3">
        <div class="flex flex-col gap-1 sm:col-span-2">
          <label for={`${idPrefix}-street`} class="text-sm font-medium text-body">
            {i18n.t("checkout.street")}
          </label>
          <TextInput
            id={`${idPrefix}-street`}
            name={FIELD.street}
            type="text"
            autocomplete={`${section} address-line1`}
            aria-invalid={hasError("street")}
            aria-describedby={hasError("street") ? `${idPrefix}-street-error` : undefined}
            class={hasError("street") ? "border-danger-500" : ""}
            value={initial.street}
          />
          {@render errorText(errorFor("street"), `${idPrefix}-street-error`)}
        </div>

        <div class="flex flex-col gap-1">
          <label for={`${idPrefix}-houseNumber`} class="text-sm font-medium text-body">
            {i18n.t("checkout.houseNumber")}
          </label>
          <TextInput
            id={`${idPrefix}-houseNumber`}
            name={FIELD.houseNumber}
            type="text"
            autocomplete="off"
            aria-invalid={hasError("houseNumber")}
            aria-describedby={hasError("houseNumber") ? `${idPrefix}-houseNumber-error` : undefined}
            class={hasError("houseNumber") ? "border-danger-500" : ""}
            value={initial.houseNumber}
          />
          {@render errorText(errorFor("houseNumber"), `${idPrefix}-houseNumber-error`)}
        </div>

        <div class="flex flex-col gap-1">
          <label for={`${idPrefix}-postalCode`} class="text-sm font-medium text-body">
            {i18n.t("checkout.postalCode")}
          </label>
          <TextInput
            id={`${idPrefix}-postalCode`}
            name={FIELD.postalCode}
            type="text"
            inputmode="numeric"
            autocomplete={`${section} postal-code`}
            aria-invalid={hasError("postalCode")}
            aria-describedby={hasError("postalCode") ? `${idPrefix}-postalCode-error` : undefined}
            class={hasError("postalCode") ? "border-danger-500" : ""}
            value={initial.postalCode}
          />
          {@render errorText(errorFor("postalCode"), `${idPrefix}-postalCode-error`)}
        </div>

        <div class="flex flex-col gap-1 sm:col-span-2">
          <label for={`${idPrefix}-city`} class="text-sm font-medium text-body">
            {i18n.t("checkout.city")}
          </label>
          <TextInput
            id={`${idPrefix}-city`}
            name={FIELD.city}
            type="text"
            autocomplete={`${section} address-level2`}
            aria-invalid={hasError("city")}
            aria-describedby={hasError("city") ? `${idPrefix}-city-error` : undefined}
            class={hasError("city") ? "border-danger-500" : ""}
            value={initial.city}
          />
          {@render errorText(errorFor("city"), `${idPrefix}-city-error`)}
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <label for={`${idPrefix}-country`} class="text-sm font-medium text-body">
          {i18n.t("checkout.country")}
        </label>
        <select
          id={`${idPrefix}-country`}
          name={FIELD.country}
          autocomplete={`${section} country`}
          class="w-full rounded border border-brown-200 bg-white px-2 py-1 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-sand-300/40"
          value={initial.country}
        >
          <option value="HU">{i18n.t("checkout.countryHU")}</option>
        </select>
      </div>
    </div>
  {/snippet}
</I18nGate>
