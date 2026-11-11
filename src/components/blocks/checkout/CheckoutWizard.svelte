<script lang="ts">
  import { onMount } from "svelte";
  import Icon from "@iconify/svelte";
  import StepStrip from "./wizard/StepStrip.svelte";
  import StepSummary from "./wizard/StepSummary.svelte";
  import Collapse from "./wizard/Collapse.svelte";
  import ContactStep from "./steps/ContactStep.svelte";
  import ShippingStep from "./steps/ShippingStep.svelte";
  import BillingStep from "./steps/BillingStep.svelte";
  import ReviewStep from "./steps/ReviewStep.svelte";
  import SummaryColumn from "./summary/SummaryColumn.svelte";
  import MobileActionBar from "./MobileActionBar.svelte";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import type { i18n as I18n } from "i18next";
  import type { Locale } from "@/lib/i18n";
  import { basket } from "@/lib/basket/basket.svelte";
  import { createCheckoutSaves } from "@/lib/basket/checkoutSaves";
  import {
    addressFromForm,
    billingFromForm,
    contactFromForm,
    messageFromForm,
    valuesFromOrder,
    type CheckoutValues,
  } from "@/lib/basket/checkoutValues";
  import type { Labels } from "@/lib/basket/lineRows";
  import { majorUnits } from "@/lib/basket/money";
  import {
    billingCheck,
    contactCheck,
    entryStep,
    orderBlocker,
    orderMethod,
    reviewCheck,
    shippingCheck,
    type FieldCheck,
  } from "@/lib/basket/readiness";
  import type { ShippingQuote } from "@/lib/basket/schemas";
  import type { SetMembers } from "@/lib/basket/setDiscounts";
  import { STEPS, stepFromHash, stepIndex, type StepId } from "@/lib/basket/steps";
  import {
    billingSummary,
    contactSummary,
    shippingSummary,
    type T,
  } from "@/lib/basket/summaryText";
  import { placeOrder } from "@/lib/basket/submit";
  import { reportClientError } from "@/lib/errorReport";
  import { randomUUID } from "@/lib/uuid";
  import { translateMessage } from "@/lib/i18next-client";

  interface Props {
    locale: Locale;
    labels: Labels;
    setMembers: SetMembers;
    supportEmail: string | null | undefined;
    basketInfo?: string | undefined;
  }

  let { locale, labels, setMembers, supportEmail, basketInfo }: Props = $props();

  let methods = $state<ShippingQuote[]>([]);
  let methodsLoaded = $state(false);
  let initial = $state.raw<CheckoutValues | null>(null);
  let step = $state<StepId>("contact");
  let fieldError = $state<FieldCheck | undefined>();
  let error = $state<string | null>(null);
  let methodPending = $state(false);
  let sending = $state(false);
  let busy = $state(false);
  let success = $state<{ code: string } | null>(null);
  let highlightedLines = $state<readonly string[]>([]);
  let termsAccepted = $state(false);

  const order = $derived(basket.order);
  const method = $derived(orderMethod(order, methods));
  const saved = $derived(order === null ? null : valuesFromOrder(order));
  const currentIndex = $derived(stepIndex(step));
  const blocker = $derived(orderBlocker(order));
  const submitDisabled = $derived(sending || blocker !== undefined || !termsAccepted);

  const saves = createCheckoutSaves(basket.api, {
    order: () => basket.order,
    apply: (result) => basket.apply(result),
  });

  onMount(() => {
    basket.start();

    globalThis.addEventListener("hashchange", syncFromHash);
    globalThis.addEventListener("popstate", syncFromHash);

    return () => {
      globalThis.removeEventListener("hashchange", syncFromHash);
      globalThis.removeEventListener("popstate", syncFromHash);
    };
  });

  $effect(() => {
    const key = order === null ? null : `${order.id}:${order.totalWithTax}`;

    if (key === null) {
      return;
    }

    void loadMethods();
  });

  $effect(() => {
    if (initial !== null || order === null || !methodsLoaded) {
      return;
    }

    const values = valuesFromOrder(order);

    initial = values;
    step = entryStep(values, method, stepFromHash(globalThis.location.hash.slice(1)));

    if (globalThis.location.hash.slice(1) !== step) {
      history.replaceState(null, "", `#${step}`);
    }
  });

  async function loadMethods(): Promise<void> {
    const result = await basket.api.eligibleShippingMethods();

    if (!result.ok) {
      error = "errors.loadMethods";
      return;
    }

    methods = result.value;
    methodsLoaded = true;
  }

  function syncFromHash(): void {
    const hashStep = stepFromHash(globalThis.location.hash.slice(1));

    if (hashStep === undefined || hashStep === step) {
      return;
    }

    fieldError = undefined;
    step = hashStep;
  }

  function goTo(id: StepId): void {
    history.pushState(null, "", `#${id}`);
    fieldError = undefined;
    step = id;
    globalThis.scrollTo({ top: 0 });
  }

  function onBack(id: StepId): void {
    goTo(STEPS[stepIndex(id) - 1].id);
  }

  function saveContact(data: FormData): Promise<void> {
    const contact = contactFromForm(data);

    if (contactCheck(contact) !== undefined) {
      return Promise.resolve();
    }

    return saves.contact(contact);
  }

  async function saveShipping(data: FormData): Promise<void> {
    await saves.shipping(addressFromForm(data));
    await loadMethods();
  }

  function saveBilling(data: FormData): Promise<void> {
    return saves.billing(billingFromForm(data), method);
  }

  function saveMessage(data: FormData): Promise<void> {
    return saves.message(messageFromForm(data));
  }

  function stepCheck(id: StepId, data: FormData): FieldCheck | undefined {
    if (id === "contact") {
      return contactCheck(contactFromForm(data));
    }

    if (id === "shipping") {
      return shippingCheck(addressFromForm(data), method);
    }

    if (id === "billing") {
      return billingCheck(billingFromForm(data), method);
    }

    return undefined;
  }

  function stepSave(id: StepId, data: FormData): Promise<void> {
    if (id === "contact") {
      return saveContact(data);
    }

    if (id === "shipping") {
      return saveShipping(data);
    }

    if (id === "billing") {
      return saveBilling(data);
    }

    return saveMessage(data);
  }

  async function onContinue(id: StepId, data: FormData): Promise<void> {
    const check = stepCheck(id, data);

    if (check !== undefined) {
      fieldError = check;
      return;
    }

    fieldError = undefined;
    await stepSave(id, data);
    goTo(STEPS[stepIndex(id) + 1].id);
  }

  async function onMethod(shippingMethodId: string): Promise<void> {
    methodPending = true;

    try {
      await saves.method(shippingMethodId);
    } finally {
      methodPending = false;
    }
  }

  function formData(id: StepId): FormData {
    const form = document.forms.namedItem(`wizard-step-${id}`);

    if (form === null) {
      return new FormData();
    }

    return new FormData(form);
  }

  function valuesFromForms(): CheckoutValues {
    return {
      contact: contactFromForm(formData("contact")),
      address: addressFromForm(formData("shipping")),
      billing: billingFromForm(formData("billing")),
      message: messageFromForm(formData("review")),
    };
  }

  function stepText(id: StepId, values: CheckoutValues, currencyCode: string, t: T): string {
    if (id === "contact") {
      return contactSummary(values.contact);
    }

    if (id === "shipping") {
      return shippingSummary(method, values.address, currencyCode, t);
    }

    return billingSummary(values.billing, method, t);
  }

  function translator(i18n: I18n): T {
    return (key: string) => translateMessage(i18n, key);
  }

  function nextLabelKey(id: StepId): string {
    if (id === "contact") {
      return "checkout.continueShipping";
    }

    if (id === "shipping") {
      return "checkout.continueBilling";
    }

    if (id === "billing") {
      return "checkout.continueReview";
    }

    return "checkout.placeOrder";
  }

  async function removeLine(lineId: string): Promise<void> {
    busy = true;

    try {
      const result = await basket.remove(lineId);

      if (!result.ok) {
        error = "errors.changeFailed";
      }
    } finally {
      busy = false;
    }
  }

  async function onSubmit(): Promise<void> {
    error = null;

    const found = blocker ?? reviewCheck(termsAccepted);

    if (found !== undefined) {
      error = found.message;
      return;
    }

    if (method === undefined) {
      error = "blockers.method";
      return;
    }

    sending = true;
    await saves.settled();

    const transactionId = randomUUID();
    const result = await placeOrder(
      basket.api,
      { values: valuesFromForms(), shippingMethod: method, termsAccepted, transactionId },
      (report) => reportClientError({ kind: "order", ...report })
    );

    sending = false;

    if (!result.ok) {
      error = result.message;
      return;
    }

    const value = majorUnits(result.order.totalWithTax, result.order.currencyCode);
    const currency = result.order.currencyCode;

    if (globalThis.window.fbq) {
      try {
        globalThis.window.fbq("track", "Purchase", {
          currency,
          value,
          num_items: result.order.lines.length,
        });
      } catch (e) {
        console.error("Failed to record purchase", e);
      }
    }

    try {
      gtag("event", "conversion", { value, currency, transaction_id: transactionId });
    } catch (e) {
      console.error("Failed to record purchase conversion", e);
    }

    basket.finish();
    success = { code: result.order.code };
  }
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    <div class="mx-auto flex w-full max-w-160 flex-col gap-6 text-body lg:max-w-6xl">
      {#if success}
        <div
          class="flex flex-col items-center gap-3 rounded-2xl border border-green-600 bg-green-50 p-8 text-center lg:mx-auto lg:max-w-160"
        >
          <Icon icon="mdi:check-circle" class="text-4xl text-green-600" />
          <p class="text-green-800">
            {i18n.t("checkout.success")}
          </p>
          <p class="text-green-800">
            {i18n.t("checkout.orderNumber")}
            <strong data-testid="order-code">{success.code}</strong>
          </p>
          <a
            href="/product/"
            class="mt-2 flex h-11 items-center justify-center rounded-md bg-brown-500 px-4 text-sm font-medium uppercase text-white transition-all hover:bg-brown-700"
          >
            {i18n.t("checkout.backToProducts")}
          </a>
        </div>
      {:else if basket.loaded && (order === null || order.lines.length === 0)}
        <div
          class="flex flex-col items-center gap-3 rounded-2xl border border-brown-200 bg-brown-50 p-8 text-center lg:mx-auto lg:max-w-160"
        >
          <Icon icon="mdi:cart-outline" class="text-4xl text-brown-400" />
          <p class="text-brown-600">
            {basket.loadFailed
              ? i18n.t("checkout.basketUnavailable")
              : i18n.t("checkout.basketEmpty")}
          </p>
          <a
            href="/product/"
            class="mt-2 flex h-11 items-center justify-center rounded-md bg-brown-500 px-4 text-sm font-medium uppercase text-white transition-all hover:bg-brown-700"
          >
            {i18n.t("checkout.viewProducts")}
          </a>
        </div>
      {:else if initial === null || order === null || saved === null}
        <div
          class="min-h-64 w-full animate-pulse rounded-xl border border-brown-200 bg-brown-100 lg:mx-auto lg:max-w-160"
        ></div>
      {:else}
        <div class="grid grid-cols-1 items-start gap-6 pb-24 lg:grid-cols-[1fr_420px] lg:pb-0">
          <div class="flex min-w-0 flex-col">
            <div class="pb-4">
              <StepStrip {locale} current={step} onJump={goTo} />
            </div>

            {#each STEPS as stepDef (stepDef.id)}
              {@const active = stepDef.id === step}
              {@const shown = stepIndex(stepDef.id) < currentIndex}

              <div>
                <Collapse open={active}>
                  <div class="pb-4">
                    <h2 class="pb-4 text-2xl font-bold text-headings">
                      {translateMessage(i18n, stepDef.labelKey)}
                    </h2>

                    {#if stepDef.id === "contact"}
                      <ContactStep
                        {locale}
                        initial={initial.contact}
                        error={fieldError}
                        onSave={(data) => void saveContact(data)}
                        onContinue={(data) => void onContinue("contact", data)}
                      />
                    {:else if stepDef.id === "shipping"}
                      <ShippingStep
                        {locale}
                        initial={initial.address}
                        {methods}
                        selectedId={method?.id}
                        {methodPending}
                        currencyCode={order.currencyCode}
                        error={fieldError}
                        onMethod={(id) => void onMethod(id)}
                        onSave={(data) => void saveShipping(data)}
                        onContinue={(data) => void onContinue("shipping", data)}
                        onBack={() => onBack("shipping")}
                      />
                    {:else if stepDef.id === "billing"}
                      <BillingStep
                        {locale}
                        initial={initial.billing}
                        {method}
                        error={fieldError}
                        onSave={(data) => void saveBilling(data)}
                        onContinue={(data) => void onContinue("billing", data)}
                        onBack={() => onBack("billing")}
                      />
                    {:else}
                      <ReviewStep
                        {locale}
                        {order}
                        {labels}
                        {setMembers}
                        {highlightedLines}
                        initialMessage={initial.message}
                        contactSummary={stepText("contact", saved, order.currencyCode, translator(i18n))}
                        shippingSummary={stepText("shipping", saved, order.currencyCode, translator(i18n))}
                        billingSummary={stepText("billing", saved, order.currencyCode, translator(i18n))}
                        bind:terms={termsAccepted}
                        {error}
                        {sending}
                        {submitDisabled}
                        onBack={() => onBack("review")}
                        onEdit={goTo}
                        onSave={(data) => void saveMessage(data)}
                        {onSubmit}
                        {supportEmail}
                        {basketInfo}
                        shownPrices={basket.shownPrices}
                        {busy}
                        onHighlight={(lineIds) => (highlightedLines = lineIds)}
                        onRemoveLine={(lineId) => removeLine(lineId)}
                      />
                    {/if}
                  </div>
                </Collapse>

                <div
                  inert={!shown}
                  aria-hidden={shown ? undefined : "true"}
                  class="hidden transition-[grid-template-rows,opacity] duration-200 ease-out lg:grid {shown
                    ? 'grid-rows-[1fr] opacity-100 delay-100'
                    : 'grid-rows-[0fr] opacity-0'}"
                >
                  <div class="overflow-hidden min-h-0">
                    <div class="pb-4">
                      <StepSummary
                        {locale}
                        title={translateMessage(i18n, stepDef.labelKey)}
                        summary={stepText(stepDef.id, saved, order.currencyCode, translator(i18n))}
                        onEdit={() => goTo(stepDef.id)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            {/each}

            {#if error !== null && step !== "review"}
              <p class="text-sm text-danger-500" role="alert">
                {translateMessage(i18n, error)}
              </p>
            {/if}
          </div>

          <SummaryColumn
            {locale}
            {order}
            {labels}
            {setMembers}
            {highlightedLines}
            {basketInfo}
            shownPrices={basket.shownPrices}
            {busy}
            onHighlight={(lineIds) => (highlightedLines = lineIds)}
            onRemoveLine={(lineId) => removeLine(lineId)}
          />
        </div>

        <MobileActionBar
          {locale}
          {order}
          {labels}
          {setMembers}
          {highlightedLines}
          backVisible={step !== "contact"}
          onBack={() => onBack(step)}
          nextLabel={translateMessage(i18n, nextLabelKey(step))}
          nextDisabled={step === "review" ? submitDisabled : false}
          formId={`wizard-step-${step}`}
          {basketInfo}
          shownPrices={basket.shownPrices}
          {busy}
          onHighlight={(lineIds) => (highlightedLines = lineIds)}
          onRemoveLine={(lineId) => removeLine(lineId)}
        />
      {/if}
    </div>
  {/snippet}
</I18nGate>
