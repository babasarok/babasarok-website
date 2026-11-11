<script lang="ts">
  import Icon from "@iconify/svelte";
  import Button from "@/components/ui/Button.svelte";
  import TextInput from "@/components/ui/TextInput.svelte";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import type { i18n as I18n } from "i18next";
  import type { Locale } from "@/lib/i18n";
  import { FIELD, type ContactValues } from "@/lib/basket/checkoutValues";
  import type { FieldCheck } from "@/lib/basket/readiness";
  import { translateMessage } from "@/lib/i18next-client";

  interface Props {
    locale: Locale;
    initial: ContactValues;
    error?: FieldCheck | undefined;
    pending: boolean;
    onSave: (data: FormData) => void;
    onContinue: (data: FormData) => void;
  }

  let { locale, initial, error, pending, onSave, onContinue }: Props = $props();

  function nameError(): boolean {
    return error?.field === "name";
  }

  function emailError(): boolean {
    return error?.field === "email";
  }

  function nameCheck(): FieldCheck | undefined {
    return error?.field === "name" ? error : undefined;
  }

  function emailCheck(): FieldCheck | undefined {
    return error?.field === "email" ? error : undefined;
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

    <form
      id="wizard-step-contact"
      data-testid="step-contact"
      class="flex flex-col gap-4 rounded-2xl border border-brown-200 bg-white p-4 sm:p-6 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0"
      onchange={(event) => onSave(new FormData(event.currentTarget))}
      onsubmit={(event) => {
        event.preventDefault();
        onContinue(new FormData(event.currentTarget));
      }}
    >
      <div class="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
        <div class="flex flex-col gap-1">
          <label for="contact-lastName" class="text-sm font-medium text-body">
            {i18n.t("checkout.lastName")}
          </label>
          <TextInput
            id="contact-lastName"
            name={FIELD.lastName}
            type="text"
            autocomplete="family-name"
            aria-invalid={nameError()}
            aria-describedby={nameError() ? "contact-name-error" : undefined}
            class={nameError() ? "border-danger-500" : ""}
            value={initial.lastName}
          />
        </div>

        <div class="flex flex-col gap-1">
          <label for="contact-firstName" class="text-sm font-medium text-body">
            {i18n.t("checkout.firstName")}
          </label>
          <TextInput
            id="contact-firstName"
            name={FIELD.firstName}
            type="text"
            autocomplete="given-name"
            aria-invalid={nameError()}
            aria-describedby={nameError() ? "contact-name-error" : undefined}
            class={nameError() ? "border-danger-500" : ""}
            value={initial.firstName}
          />
        </div>

        <div class="sm:col-span-2">
          {@render errorText(nameCheck(), "contact-name-error")}
        </div>
      </div>

      <div class="flex flex-col gap-1">
        <label for="contact-email" class="text-sm font-medium text-body">
          {i18n.t("checkout.email")}
        </label>
        <TextInput
          id="contact-email"
          name={FIELD.email}
          type="email"
          autocomplete="email"
          aria-invalid={emailError()}
          aria-describedby={emailError() ? "contact-email-error" : undefined}
          class={emailError() ? "border-danger-500" : ""}
          value={initial.email}
        />
        {@render errorText(emailCheck(), "contact-email-error")}
      </div>

      <div class="flex flex-col gap-1">
        <label for="contact-phone" class="flex items-center gap-2 text-sm font-medium text-body">
          {i18n.t("checkout.phone")}
          <!-- TODO: needed when we implement true GLS shipping -->
          <!-- <span class="rounded bg-brown-100 px-1.5 py-0.5 text-xs font-normal text-brown-600">
            {i18n.t("checkout.phoneHint")}
          </span> -->
        </label>
        <TextInput
          id="contact-phone"
          name={FIELD.phone}
          type="tel"
          autocomplete="tel"
          value={initial.phone}
        />
      </div>

      <div class="mt-2 hidden items-center justify-end gap-3 lg:flex">
        <Button
          type="submit"
          variant="contained"
          class="flex h-11 flex-nowrap items-center gap-2 px-6 uppercase"
          disabled={pending}
          aria-busy={pending}
        >
          {i18n.t("checkout.continueShipping")}
          <Icon
            icon={pending ? "mdi:loading" : "mdi:arrow-right"}
            class="text-lg {pending ? 'animate-spin' : ''}"
          />
        </Button>
      </div>
    </form>
  {/snippet}
</I18nGate>
