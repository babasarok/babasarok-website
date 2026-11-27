<script lang="ts">
  import Icon from "@iconify/svelte";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import type { i18n as I18n } from "i18next";
  import { localizedPath, type Locale } from "@/lib/i18n";
  import { basket } from "@/lib/basket/basket.svelte";
  import {
    barionRetryErrorKey,
    confirmationView,
    parseConfirmationParams,
    POLL_INTERVAL_MS,
    type BarionRefusalKey,
    type ConfirmationParams,
    type ConfirmationView,
  } from "@/lib/basket/barion";

  interface Props {
    locale: Locale;
    supportEmail: string | null | undefined;
  }

  let { locale, supportEmail }: Props = $props();

  /**
   * The query is readable only in the browser (the page is prerendered), so
   * server rendering starts at "pending" — the neutral Processing card.
   */
  type ParsedParams = ConfirmationParams | "invalid" | "pending";

  let params = $state<ParsedParams>("pending");
  let status = $state<string>();
  let elapsed = $state(0);
  let retrying = $state(false);
  let retryError = $state<BarionRefusalKey>();

  /** Same session: the placed order is still the intent's target (ADR 0021 §5). */
  async function retryPayment(): Promise<void> {
    if (typeof params !== "object" || retrying) {
      return;
    }

    retrying = true;
    retryError = undefined;
    const intent = await basket.api.createBarionPaymentIntent(params.orderCode);

    if (intent.ok) {
      globalThis.location.assign(intent.value.gatewayUrl);
      return;
    }

    // A refused retry must be visible: the common case is a foreign session
    // (the intent is session-scoped), which the backend refuses by code.
    retryError = barionRetryErrorKey(intent.failure.detail);
    retrying = false;
  }

  const view = $derived<ConfirmationView>(
    params === "invalid"
      ? "failed"
      : params === "pending"
        ? "processing"
        : confirmationView(status, elapsed)
  );

  $effect(() => {
    if (params === "pending") {
      params =
        parseConfirmationParams(new URLSearchParams(globalThis.location.search)) ?? "invalid";
      return;
    }

    if (params === "invalid") {
      return;
    }

    const { orderCode } = params;
    const started = Date.now();

    async function poll(): Promise<void> {
      const result = await basket.api.barionPaymentStatus(orderCode);

      if (result.ok && result.value !== null) {
        // A null paymentId means no intent row exists for the order: nothing
        // was ever started (e.g. the wizard redirected here after a refused
        // intent) — the declined view is the honest rendering.
        status = result.value.paymentId === null ? "Failed" : result.value.status;

        // The basket is only cleared once the payment is confirmed — the
        // order is truly on our end exactly here.
        if (status === "Succeeded") {
          basket.finish();
        }
      }
    }

    void poll();

    const timer = globalThis.setInterval(() => {
      elapsed = Date.now() - started;

      if (confirmationView(status, elapsed) !== "processing") {
        globalThis.clearInterval(timer);
        return;
      }

      void poll();
    }, POLL_INTERVAL_MS);

    return () => globalThis.clearInterval(timer);
  });

  const cardClass = $derived(
    view === "succeeded"
      ? "border-success-600 bg-success-50"
      : view === "failed"
        ? "border-danger-500/30 bg-danger-500/10"
        : "border-brown-200 bg-brown-50"
  );
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    <div
      class="flex flex-col items-center gap-3 rounded-2xl border p-8 text-center lg:mx-auto lg:max-w-160 {cardClass}"
    >
      {#if view === "succeeded"}
        <Icon icon="mdi:check-circle" class="text-4xl text-success-600" />
        <p class="text-lg font-semibold text-success-800">{i18n.t("payment.succeeded")}</p>
        <p class="text-success-800">
          {i18n.t("checkout.orderNumber")}
          <strong data-testid="confirmation-order-code"
            >{typeof params === "object" ? params.orderCode : ""}</strong
          >
        </p>
        <p class="text-sm text-success-800">{i18n.t("payment.succeededNote")}</p>
        <a
          href={localizedPath("/", locale)}
          class="mt-2 flex h-11 items-center justify-center rounded-md bg-brown-500 px-4 text-sm font-medium uppercase text-white transition-all hover:bg-brown-700"
        >
          {i18n.t("payment.backHome")}
        </a>
      {:else if view === "failed"}
        <Icon icon="mdi:alert-circle" class="text-4xl text-danger-500" />
        <p class="text-lg font-semibold text-danger-500">{i18n.t("payment.failed")}</p>
        <p class="text-sm text-body">{i18n.t("payment.failedNote")}</p>
        {#if typeof params === "object"}
          <button
            type="button"
            onclick={retryPayment}
            disabled={retrying}
            class="mt-2 flex h-11 cursor-pointer items-center justify-center rounded-md bg-brown-500 px-4 text-sm font-medium uppercase text-white transition-all hover:bg-brown-700 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="confirmation-retry"
          >
            {i18n.t("payment.tryAgain")}
          </button>
        {/if}
        {#if retryError}
          <p class="text-sm text-danger-500">{i18n.t(retryError)}</p>
        {/if}
        <a
          href={localizedPath("/checkout", locale)}
          class="text-sm text-body underline hover:text-brown-700"
        >
          {i18n.t("payment.backToCheckout")}
        </a>
      {:else}
        <Icon icon="mdi:loading" class="animate-spin text-4xl text-brown-500" />
        <p class="text-brown-600">{i18n.t("payment.processing")}</p>
        <p class="text-sm text-brown-600">{i18n.t("payment.processingNote")}</p>

        {#if view === "stalled"}
          <p class="text-sm text-brown-600">
            {i18n.t("payment.stalledHint")}
            {#if supportEmail}
              <a class="underline hover:text-brown-700" href={`mailto:${supportEmail}`}
                >{supportEmail}</a
              >
            {/if}
          </p>
        {/if}
      {/if}
    </div>
  {/snippet}
</I18nGate>
