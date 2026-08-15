<script lang="ts">
  import { onMount } from "svelte";
  import Icon from "@iconify/svelte";
  import { orderBasket } from "@/lib/orderBasket.svelte";

  interface ProductMeta {
    title: string;
    slug: string;
  }

  interface Props {
    productMeta: Record<string, ProductMeta | undefined>;
    checkoutHref?: string;
    /** Anchor the panel to the button (desktop). When false, pin it to the
     * viewport as a sheet so it can't overflow on narrow screens. */
    anchored?: boolean;
  }

  let { productMeta, checkoutHref = "/contact", anchored = true }: Props = $props();

  let open = $state(false);
  let buttonEl: HTMLButtonElement | undefined;
  let panelTop = $state(0);

  function reposition(): void {
    if (buttonEl) {
      panelTop = buttonEl.getBoundingClientRect().bottom + 8;
    }
  }

  onMount(() => {
    orderBasket.start();
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

  const items = $derived(orderBasket.items);
  const count = $derived(orderBasket.count);
</script>

<div class="relative">
  <button
    type="button"
    bind:this={buttonEl}
    class="relative flex cursor-pointer items-center gap-1 p-2 text-dark transition-colors hover:text-sand-300"
    aria-label="Kosár"
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
        <p class="py-4 text-center text-sm text-brown-500">A kosár üres.</p>
      {:else}
        <ul class="flex max-h-[50vh] flex-col gap-2 overflow-auto">
          {#each items as basketItem (basketItem.uuid)}
            {@const meta = productMeta[basketItem.product_id]}
            <li class="flex items-center gap-2 rounded-lg border border-brown-100 p-2 text-sm">
              <div class="flex min-w-0 flex-1 flex-col">
                <span class="truncate font-medium text-dark">
                  {meta?.title ?? basketItem.product_id}
                </span>
                <span class="text-xs text-brown-500">{basketItem.count} db</span>
              </div>
              {#if meta}
                <a
                  href={`/product/${meta.slug}/?uuid=${basketItem.uuid}`}
                  class="shrink-0 rounded-full p-1.5 text-brown-500 transition-colors hover:bg-brown-100"
                  aria-label="Szerkesztés"
                >
                  <Icon icon="mdi:pencil" />
                </a>
              {/if}
              <button
                type="button"
                class="shrink-0 cursor-pointer rounded-full p-1.5 text-brown-500 transition-colors hover:bg-brown-100"
                aria-label="Törlés"
                onclick={() => orderBasket.remove(basketItem.uuid)}
              >
                <Icon icon="mdi:delete-outline" />
              </button>
            </li>
          {/each}
        </ul>
        <a
          href={checkoutHref}
          class="mt-3 flex h-10 items-center justify-center rounded-md bg-brown-500 font-medium uppercase text-white transition-colors hover:bg-brown-700"
        >
          Pénztár
        </a>
      {/if}
    </div>
  {/if}
</div>
