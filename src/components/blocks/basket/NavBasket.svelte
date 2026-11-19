<script lang="ts">
  import type { i18n as I18n } from "i18next";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import { localizedPath, type Locale } from "@/lib/i18n";
  import { onMount } from "svelte";
  import Icon from "@iconify/svelte";
  import { basket } from "@/lib/basket/basket.svelte";
  import { formatMoney } from "@/lib/basket/money";

  interface Props {
    locale: Locale;
    /** Anchor the panel to the button (desktop). When false, pin it to the
     * viewport as a sheet so it can't overflow on narrow screens. */
    anchored?: boolean;
  }

  let { locale, anchored = true }: Props = $props();

  let open = $state(false);
  let buttonEl: HTMLButtonElement | undefined;
  let panelTop = $state(0);

  function reposition(): void {
    if (buttonEl) {
      panelTop = buttonEl.getBoundingClientRect().bottom + 8;
    }
  }

  onMount(() => {
    basket.start();
  });

  // Keep the pinned sheet under the button when the viewport resizes.
  $effect(() => {
    if (anchored || !open) {
      return;
    }
    reposition();
    const onResize = (): void => reposition();
    globalThis.addEventListener("resize", onResize);
    return () => globalThis.removeEventListener("resize", onResize);
  });

  const order = $derived(basket.order);
  const items = $derived(order?.lines ?? []);
  const count = $derived(basket.count);
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    <div class="relative">
      <button
        type="button"
        bind:this={buttonEl}
        class="relative flex cursor-pointer items-center gap-1 p-2 text-dark transition-colors hover:text-sand-300"
        aria-label={i18n.t("basket.label")}
        aria-expanded={open}
        onclick={() => {
          open = !open;
          if (open && !anchored) {
            reposition();
          }
        }}
      >
        <Icon icon="mdi:cart-outline" class="text-2xl" />
        {#if count > 0}
          <span
            data-testid="nav-basket-count"
            class="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-sand-300 px-1 text-xs font-medium text-white"
          >
            {count}
          </span>
        {/if}
      </button>

      {#if open}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="fixed inset-0 z-40"
          onclick={() => (open = false)}
          onkeydown={(e) => e.key === "Escape" && (open = false)}
        ></div>
        <div
          class={[
            "z-50 flex flex-col rounded-xl border border-brown-200 bg-white p-3 text-left shadow-lg",
            anchored
              ? "absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)]"
              : "fixed right-3 w-80 max-w-[calc(100vw-1.5rem)]",
          ]}
          style={anchored ? undefined : `top:${panelTop}px`}
        >
          {#if items.length === 0}
            <p class="py-4 text-center text-sm text-brown-500">{i18n.t("basket.empty")}</p>
            <a
              href={localizedPath("/product/", locale)}
              class="flex h-10 items-center justify-center rounded-md bg-brown-500 font-medium uppercase text-white transition-colors hover:bg-brown-700"
            >
              {i18n.t("basket.browse")}
            </a>
          {:else}
            <ul class="flex max-h-[50vh] flex-col gap-2 overflow-auto">
              {#each items as basketItem (basketItem.id)}
                {@const product = basketItem.productVariant.product}
                <li class="flex items-center gap-2 rounded-lg border border-brown-100 p-2 text-sm">
                  <div class="flex min-w-0 flex-1 flex-col">
                    <span class="truncate font-medium text-dark">
                      {product.name}
                    </span>
                    <span class="text-xs text-brown-500">
                      {basketItem.quantity}
                      {i18n.t("common.piece")}
                      {#if order}· {formatMoney(
                          basketItem.discountedLinePriceWithTax,
                          order.currencyCode
                        )}{/if}
                    </span>
                  </div>
                  <a
                    href={localizedPath(`/product/${product.slug}/?line=${basketItem.id}`, locale)}
                    class="shrink-0 rounded-full p-1.5 text-brown-500 transition-colors hover:bg-brown-100"
                    aria-label={i18n.t("basket.edit")}
                  >
                    <Icon icon="mdi:pencil" />
                  </a>
                  <button
                    type="button"
                    class="shrink-0 cursor-pointer rounded-full p-1.5 text-brown-500 transition-colors hover:bg-brown-100"
                    aria-label={i18n.t("basket.remove")}
                    onclick={() => basket.remove(basketItem.id)}
                  >
                    <Icon icon="mdi:delete-outline" />
                  </button>
                </li>
              {/each}
            </ul>
            <a
              href={localizedPath("/checkout", locale)}
              class="mt-3 flex h-10 items-center justify-center rounded-md bg-brown-500 font-medium uppercase text-white transition-colors hover:bg-brown-700"
            >
              {i18n.t("basket.checkout")}
            </a>
          {/if}
        </div>
      {/if}
    </div>
  {/snippet}
</I18nGate>
