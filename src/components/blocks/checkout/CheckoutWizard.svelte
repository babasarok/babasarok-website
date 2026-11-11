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
  import {
    EMPTY_DRAFTS,
    adoptPickupBilling,
    createDraftSaver,
    draftsFromOrder,
    restoreShippingBilling,
    type CheckoutDrafts,
  } from "@/lib/basket/drafts";
  import type { Labels } from "@/lib/basket/lineRows";
  import { majorUnits } from "@/lib/basket/money";
  import {
    billingCheck,
    contactCheck,
    entryStep,
    orderBlocker,
    reviewCheck,
    selectedMethod,
    shippingCheck,
    type FieldCheck,
  } from "@/lib/basket/readiness";
  import { requiresAddress, type ShippingQuote } from "@/lib/basket/schemas";
  import type { SetMembers } from "@/lib/basket/setDiscounts";
  import { STEPS, stepFromHash, stepIndex, type StepId } from "@/lib/basket/steps";
  import { billingSummary, contactSummary, shippingSummary } from "@/lib/basket/summaryText";
  import { placeOrder } from "@/lib/basket/submit";
  import { reportClientError } from "@/lib/errorReport";
  import { randomUUID } from "@/lib/uuid";
  import { translateMessage } from "@/lib/i18next-client";
  import type { T } from "@/lib/basket/summaryText";

  interface Props {
    locale: Locale;
    labels: Labels;
    setMembers: SetMembers;
    supportEmail: string | null | undefined;
    basketInfo?: string | undefined;
  }

  let { locale, labels, setMembers, supportEmail, basketInfo }: Props = $props();

  let drafts = $state<CheckoutDrafts>(EMPTY_DRAFTS);
  let methods = $state<ShippingQuote[]>([]);
  let shippingMethodId = $state("");
  let step = $state<StepId>("contact");
  let error = $state<string | null>(null);
  let sending = $state(false);
  let busy = $state(false);
  let success = $state<{ code: string } | null>(null);
  let highlightedLines = $state<readonly string[]>([]);
  let fieldError = $state<FieldCheck | undefined>();
  let methodsLoading = $state(false);
  let methodsSettled = $state(false);
  let termsAccepted = $state(false);

  const order = $derived(basket.order);
  const method = $derived(selectedMethod(methods, shippingMethodId));
  const currentIndex = $derived(stepIndex(step));
  const blocker = $derived(orderBlocker(order));
  const submitDisabled = $derived(sending || blocker !== undefined || !termsAccepted);

  const saver = createDraftSaver(basket.api, () => ({ drafts, method }));

  let prefilledFor: string | null = null;
  let entryResolved = false;
  let addressState: boolean | null = null;
  let pickupAdopted = false;

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
    const current = basket.order;

    if (current === null || current.id === prefilledFor) {
      return;
    }

    prefilledFor = current.id;
    drafts = draftsFromOrder(current);
    saver.adopt(drafts);
    shippingMethodId = current.shippingLines.at(0)?.shippingMethod.id ?? "";
  });

  $effect(() => {
    if (!methodsSettled || entryResolved || basket.order === null) {
      return;
    }

    entryResolved = true;
    step = entryStep(
      basket.order,
      methods,
      drafts,
      stepFromHash(globalThis.location.hash.slice(1))
    );

    if (globalThis.location.hash.slice(1) !== step) {
      history.replaceState(null, "", `#${step}`);
    }
  });

  $effect(() => {
    const key = order ? `${order.id}:${order.totalWithTax}` : null;

    if (key === null) {
      methods = [];
      return;
    }

    void loadMethods();
  });

  $effect(() => {
    const chosen = shippingMethodId;
    const applied = basket.order?.shippingLines.at(0)?.shippingMethod.id;

    if (chosen === "" || chosen === applied || basket.order === null) {
      return;
    }

    void basket.setShippingMethod(chosen);
  });

  $effect(() => {
    const next = selectedMethod(methods, shippingMethodId);

    if (next === undefined) {
      return;
    }

    const isPickup = !requiresAddress(next);

    if (addressState === null) {
      addressState = isPickup;

      if (isPickup) {
        drafts = adoptPickupBilling(drafts);
      }

      return;
    }

    if (isPickup === addressState) {
      return;
    }

    addressState = isPickup;

    if (isPickup) {
      drafts = adoptPickupBilling(drafts);
      pickupAdopted = true;
      return;
    }

    if (pickupAdopted) {
      pickupAdopted = false;
      drafts = restoreShippingBilling(drafts);
    }
  });

  $effect(() => {
    const _reads = JSON.stringify(drafts) + (method?.id ?? "");

    const timer = setTimeout(saveDrafts, 800);

    return () => clearTimeout(timer);
  });

  function saveDrafts(): void {
    if (sending || success !== null) {
      return;
    }

    void saver.save();
  }

  async function loadMethods(): Promise<boolean> {
    methodsLoading = true;

    try {
      const result = await basket.api.eligibleShippingMethods();

      if (!result.ok) {
        error = "errors.loadMethods";
        return false;
      }

      methods = result.value;

      const current = basket.order?.shippingLines.at(0)?.shippingMethod.id;

      if (shippingMethodId === "" && current !== undefined) {
        shippingMethodId = current;
      }

      return true;
    } finally {
      methodsLoading = false;
      methodsSettled = true;
    }
  }

  async function onCountryChange(): Promise<void> {
    await loadMethods();

    if (shippingMethodId !== "" && !methods.some((option) => option.id === shippingMethodId)) {
      shippingMethodId = "";
    }
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

  function stepCheck(id: StepId): FieldCheck | undefined {
    if (id === "contact") {
      return contactCheck(drafts.contact);
    }

    if (id === "shipping") {
      return shippingCheck(drafts.address, method);
    }

    if (id === "billing") {
      return billingCheck(drafts.billing, method);
    }

    return undefined;
  }

  function onContinue(id: StepId): void {
    const check = stepCheck(id);

    if (check !== undefined) {
      fieldError = check;
      return;
    }

    goTo(STEPS[stepIndex(id) + 1].id);
    void saver.save();
  }

  function onBack(id: StepId): void {
    goTo(STEPS[stepIndex(id) - 1].id);
  }

  function stepText(id: StepId, t: T): string {
    if (id === "contact") {
      return contactSummary(drafts.contact);
    }

    if (id === "shipping") {
      return shippingSummary(method, drafts.address, t);
    }

    return billingSummary(drafts.billing, method, t);
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
    await saver.save();

    const transactionId = randomUUID();
    const result = await placeOrder(
      basket.api,
      { drafts, shippingMethod: method, termsAccepted, transactionId },
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
      {#if !basket.loaded}
        <div
          class="min-h-64 w-full animate-pulse rounded-xl border border-brown-200 bg-brown-100 lg:mx-auto lg:max-w-160"
        ></div>
      {:else if success}
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
      {:else if !order || order.lines.length === 0}
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
      {:else}
        <div
          class="grid grid-cols-1 items-start gap-6 pb-24 lg:grid-cols-[1fr_420px] lg:pb-0"
          onfocusout={saveDrafts}
        >
          <div class="flex min-w-0 flex-col">
            <div class="pb-4">
              <StepStrip {locale} current={step} onJump={goTo} />
            </div>

            {#each STEPS as stepDef (stepDef.id)}
              {@const active = stepDef.id === step}
              {@const completed = stepIndex(stepDef.id) < currentIndex}
              {@const shown = completed && !active}

              <div>
                <Collapse open={active}>
                  <div class="pb-4">
                    <h2 class="pb-4 text-2xl font-bold text-headings">
                      {translateMessage(i18n, stepDef.labelKey)}
                    </h2>

                    {#if stepDef.id === "contact"}
                      <ContactStep
                        {locale}
                        contact={drafts.contact}
                        error={fieldError}
                        first
                        onContinue={() => onContinue("contact")}
                      />
                    {:else if stepDef.id === "shipping"}
                      <ShippingStep
                        {locale}
                        address={drafts.address}
                        {methods}
                        bind:shippingMethodId
                        error={fieldError}
                        {methodsLoading}
                        onContinue={() => onContinue("shipping")}
                        onBack={() => onBack("shipping")}
                        {onCountryChange}
                      />
                    {:else if stepDef.id === "billing"}
                      <BillingStep
                        {locale}
                        billing={drafts.billing}
                        {method}
                        error={fieldError}
                        onContinue={() => onContinue("billing")}
                        onBack={() => onBack("billing")}
                      />
                    {:else}
                      {@const contactText = contactSummary(drafts.contact)}
                      {@const shippingText = shippingSummary(
                        method,
                        drafts.address,
                        translator(i18n)
                      )}
                      {@const billingText = billingSummary(
                        drafts.billing,
                        method,
                        translator(i18n)
                      )}
                      <ReviewStep
                        {locale}
                        {order}
                        {labels}
                        {setMembers}
                        {highlightedLines}
                        contactSummary={contactText}
                        shippingSummary={shippingText}
                        billingSummary={billingText}
                        bind:terms={termsAccepted}
                        {error}
                        {sending}
                        {submitDisabled}
                        onBack={() => onBack("review")}
                        onEdit={goTo}
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
                        summary={stepText(stepDef.id, translator(i18n))}
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
          nextDisabled={step === "review" ? submitDisabled || sending : false}
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
