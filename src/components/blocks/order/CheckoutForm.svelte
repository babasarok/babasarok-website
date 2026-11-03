<script lang="ts">
  import { onMount } from "svelte";
  import Icon from "@iconify/svelte";
  import { fade } from "svelte/transition";
  import CheckoutItem from "./CheckoutItem.svelte";
  import CheckoutDeals from "./CheckoutDeals.svelte";
  import OrderDelivery from "./OrderDelivery.svelte";
  import Button from "./common/Button.svelte";
  import TextInput from "./common/TextInput.svelte";
  import { basket } from "@/lib/basket/basket.svelte";
  import { createContactSaver, draftFromOrder, type ContactDraft } from "@/lib/basket/contactDraft";
  import type { Labels } from "@/lib/basket/lineRows";
  import { formatMoney, majorUnits } from "@/lib/basket/money";
  import { checkoutBlocker, selectedMethod } from "@/lib/basket/readiness";
  import type { ShippingQuote } from "@/lib/basket/schemas";
  import { priceChange } from "@/lib/basket/stale";
  import { placeOrder } from "@/lib/basket/submit";
  import { reportClientError } from "@/lib/errorReport";
  import { randomUUID } from "@/lib/uuid";

  interface Props {
    labels: Labels;
    supportEmail: string | null | undefined;
    basketInfo?: string | undefined;
    contactHeading: string;
    basketHeading: string;
    messageHeading: string;
  }

  let { labels, supportEmail, basketInfo, contactHeading, basketHeading, messageHeading }: Props =
    $props();

  let name = $state("");
  let email = $state("");
  let phone = $state("");
  let address = $state("");
  let message = $state("");
  let shippingMethodId = $state("");
  let termsAccepted = $state(false);
  let methods = $state<ShippingQuote[]>([]);

  let busy = $state(false);
  let sending = $state(false);
  let error = $state<string | null>(null);
  let success = $state<{ code: string } | null>(null);

  const order = $derived(basket.order);
  const method = $derived(selectedMethod(methods, shippingMethodId));
  const blocker = $derived(
    checkoutBlocker(order, methods, { name, email, address, termsAccepted, shippingMethodId })
  );
  const submitDisabled = $derived(
    sending || (blocker !== undefined && blocker.field !== "method" && blocker.field !== "address")
  );
  const shippingLine = $derived(order?.shippingLines.at(0));
  const shippingFree = $derived(
    shippingLine !== undefined && shippingLine.priceWithTax > 0 && order?.shippingWithTax === 0
  );

  const readContact = (): ContactDraft => ({ name, email, phone, address, message });
  const contactSaver = createContactSaver(basket.api, readContact);
  let prefilledFor: string | null = null;

  onMount(() => {
    basket.start();
  });

  $effect(() => {
    const current = basket.order;

    if (current === null || current.id === prefilledFor) {
      return;
    }

    prefilledFor = current.id;

    const draft = draftFromOrder(current);

    ({ name, email, phone, address, message } = draft);
    contactSaver.adopt(draft);
  });

  $effect(() => {
    void readContact();

    const timer = setTimeout(saveContact, 800);

    return () => clearTimeout(timer);
  });

  function saveContact(): void {
    if (sending || success !== null) {
      return;
    }

    void contactSaver.save();
  }

  $effect(() => {
    const key = order ? `${order.id}:${order.totalWithTax}` : null;

    if (key === null) {
      methods = [];
      return;
    }

    void loadMethods();
  });

  async function loadMethods(): Promise<void> {
    const result = await basket.api.eligibleShippingMethods();

    if (!result.ok) {
      error = "A szállítási módok most nem tölthetők be. Töltsd újra az oldalt.";
      return;
    }

    methods = result.value;

    const current = basket.order?.shippingLines.at(0)?.shippingMethod.id;

    if (shippingMethodId === "" && current !== undefined) {
      shippingMethodId = current;
    }
  }

  $effect(() => {
    const chosen = shippingMethodId;
    const applied = basket.order?.shippingLines.at(0)?.shippingMethod.id;

    if (chosen === "" || chosen === applied || basket.order === null) {
      return;
    }

    void basket.setShippingMethod(chosen);
  });

  async function changeLine(task: Promise<{ ok: boolean }>): Promise<void> {
    busy = true;
    error = null;

    try {
      const result = await task;

      if (!result.ok) {
        error = "A kosár módosítása nem sikerült. Töltsd újra az oldalt, és próbáld újra.";
      }
    } finally {
      busy = false;
    }
  }

  async function onSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    error = null;

    const found = checkoutBlocker(order, methods, {
      name,
      email,
      address,
      termsAccepted,
      shippingMethodId,
    });

    if (found || !method) {
      error = found?.message ?? "Kérem, válassz egy szállítási módot.";
      return;
    }

    sending = true;
    await contactSaver.save();

    const transactionId = randomUUID();
    const result = await placeOrder(
      basket.api,
      {
        name,
        email,
        phone,
        address,
        message,
        shippingMethod: method,
        termsAccepted,
        transactionId,
      },
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

<div class="mx-auto flex w-full max-w-160 flex-col gap-6 text-body lg:max-w-5xl">
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
        Rendelésed sikeresen elküldve! Hamarosan felvesszük veled a kapcsolatot.
      </p>
      <p class="text-green-800">
        Rendelésszám: <strong data-testid="order-code">{success.code}</strong>
      </p>
      <a
        href="/product/"
        class="mt-2 flex h-11 items-center justify-center rounded-md bg-brown-500 px-4 text-sm font-medium uppercase text-white transition-all hover:bg-brown-700"
      >
        Vissza a termékekhez
      </a>
    </div>
  {:else if !order || order.lines.length === 0}
    <div
      class="flex flex-col items-center gap-3 rounded-2xl border border-brown-200 bg-brown-50 p-8 text-center lg:mx-auto lg:max-w-160"
    >
      <Icon icon="mdi:cart-outline" class="text-4xl text-brown-400" />
      <p class="text-brown-600">
        {basket.loadFailed ? "A kosár most nem érhető el." : "A kosarad üres."}
      </p>
      <a
        href="/product/"
        class="mt-2 flex h-11 items-center justify-center rounded-md bg-brown-500 px-4 text-sm font-medium uppercase text-white transition-all hover:bg-brown-700"
      >
        Nézd meg a termékeket
      </a>
    </div>
  {:else}
    <form
      class="grid grid-cols-1 items-start gap-6 lg:grid-cols-2"
      onsubmit={onSubmit}
      onfocusout={saveContact}
    >
      <section class="flex flex-col gap-3 lg:col-span-2">
        <div class="flex items-center gap-2">
          <Icon
            icon="mdi:account"
            class="shrink-0 rounded-full bg-brown-50 p-2 text-4xl text-brown-500"
          />
          <h2 class="text-lg uppercase">{contactHeading}</h2>
        </div>
        <div class="flex flex-col gap-2">
          <TextInput type="text" placeholder="Név *" required bind:value={name} />
          <TextInput type="email" placeholder="Email cím *" required bind:value={email} />
          <TextInput type="tel" placeholder="Telefonszám" bind:value={phone} />
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <div class="flex items-center gap-2">
          <Icon
            icon="mdi:cart"
            class="shrink-0 rounded-full bg-brown-50 p-2 text-4xl text-brown-500"
          />
          <h2 class="text-lg uppercase">{basketHeading}</h2>
        </div>
        {#if basketInfo}
          <div class="flex items-start gap-2 rounded-lg bg-brown-100 p-2 text-xs text-brown-600">
            <Icon icon="mdi:information-outline" class="mt-0.5 shrink-0" />
            <span>{basketInfo}</span>
          </div>
        {/if}
        {#each order.lines as line (line.id)}
          <div transition:fade={{ duration: 200 }}>
            <CheckoutItem
              {line}
              currencyCode={order.currencyCode}
              {labels}
              priceChange={priceChange(line, basket.shownPrices)}
              {busy}
              onQuantity={(quantity) => changeLine(basket.adjust(line.id, quantity))}
              onRemove={() => changeLine(basket.remove(line.id))}
            />
          </div>
        {/each}
      </section>

      <div class="flex flex-col gap-6">
        <CheckoutDeals {order} />

        <OrderDelivery
          {methods}
          currencyCode={order.currencyCode}
          bind:shippingMethodId
          bind:address
        />

        <div class="flex flex-col rounded-xl bg-brown-200 p-4">
          <div class="flex items-center gap-2">
            <Icon icon="mdi:message-text" class="shrink-0 text-2xl text-brown-500" />
            <h2 class="text-lg uppercase">{messageHeading}</h2>
          </div>
          <textarea
            bind:value={message}
            placeholder="Írd meg ide, milyen egyedi színekre, mintákra gondoltál, vagy ha van bármilyen egyedi kérésed (pl. név hímzése)!"
            class="mt-4 min-h-22 rounded border border-brown-200 bg-white p-2 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-sand-300/40"
          ></textarea>
        </div>

        <div class="flex flex-col gap-1 rounded-xl bg-brown-50 p-4">
          <div class="flex items-center justify-between text-sm text-body">
            <span>Szállítás</span>
            <span>
              {#if !shippingLine}
                —
              {:else if shippingFree}
                <span class="mr-1 line-through opacity-60">
                  {formatMoney(shippingLine.priceWithTax, order.currencyCode)}
                </span>
                Ingyenes
              {:else}
                {formatMoney(order.shippingWithTax, order.currencyCode)}
              {/if}
            </span>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-lg font-medium uppercase">Végösszeg</span>
            <span class="text-lg font-semibold text-dark">
              {formatMoney(order.totalWithTax, order.currencyCode)}
            </span>
          </div>
        </div>

        <div class="flex items-center gap-2 rounded border border-gray-300 bg-brown-100 p-2">
          <Icon icon="mdi:info" class="shrink-0 text-2xl text-yellow-500" />
          <p class="text-xs text-yellow-700">
            Jelenleg a rendelési folyamat tesztelés alatt áll. Ha bármilyen problémát tapasztalsz,
            kérlek, jelezd nekünk a <a
              class="text-yellow-700 underline hover:text-yellow-900"
              href={`mailto:${supportEmail ?? ""}?subject=Babasarok rendelési probléma&body=Kérlek, írd le a problémát, ha lehet screenshot-tal együtt.&cc=attilagreguss@protonmail.com`}
              >email címünkön</a
            >.
          </p>
        </div>

        {#if error}
          <p class="text-sm text-red-500" data-testid="checkout-error">{error}</p>
        {/if}

        <label class="text-body flex cursor-pointer items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            bind:checked={termsAccepted}
            required
            class="size-4 accent-accent"
          />
          Elfogadom az
          <a href="/terms" target="_blank" rel="noopener" class="underline hover:text-brown-700"
            >Általános Szerződési Feltételeket (ÁSZF)</a
          >
        </label>

        <Button class="h-11 uppercase" variant="contained" type="submit" disabled={submitDisabled}>
          Leadom a rendelést!
        </Button>
      </div>
    </form>
  {/if}
</div>
