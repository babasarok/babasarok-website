<script lang="ts">
  import Icon from "@iconify/svelte";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import type { i18n as I18n } from "i18next";
  import { localizedPath, type Locale } from "@/lib/i18n";
  import { basket } from "@/lib/basket/basket.svelte";
  import {
    confirmationView,
    parseConfirmationParams,
    POLL_INTERVAL_MS,
    type ConfirmationView,
  } from "@/lib/basket/barion";

  interface Props {
    locale: Locale;
    supportEmail: string | null | undefined;
  }

  let { locale, supportEmail }: Props = $props();

  const params = parseConfirmationParams(new URLSearchParams(globalThis.location.search));
  let status = $state<string>();
  let elapsed = $state(0);

  const view = $derived<ConfirmationView>(
    params === undefined ? "failed" : confirmationView(status, elapsed)
  );

  $effect(() => {
    if (params === undefined) {
      return;
    }

    const { orderCode } = params;
    const started = Date.now();

    async function poll(): Promise<void> {
      const result = await basket.api.barionPaymentStatus(orderCode);

      if (result.ok && result.value !== null) {
        status = result.value.status;
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
          <strong data-testid="confirmation-order-code">{params?.orderCode}</strong>
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
        <a
          href={localizedPath("/checkout", locale)}
          class="mt-2 flex h-11 items-center justify-center rounded-md bg-brown-500 px-4 text-sm font-medium uppercase text-white transition-all hover:bg-brown-700"
          data-testid="confirmation-retry"
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
