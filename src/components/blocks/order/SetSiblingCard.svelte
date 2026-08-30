<script lang="ts">
  import Icon from "@iconify/svelte";
  import { hasConfigurableOptions } from "@/lib/orderProduct";
  import type { CmsEnhancedProduct } from "@/lib/data";

  interface Props {
    product: CmsEnhancedProduct;
    href?: string | undefined;
    discount?: number | undefined;
    added?: number;
    disabled?: boolean;
    onAdd: () => void;
  }

  let { product, href, discount, added = 0, disabled = false, onAdd }: Props = $props();

  const configurable = $derived(hasConfigurableOptions(product));
</script>

{#snippet thumb()}
  {#if product.thumbnail}
    <img
      src={product.thumbnail.src}
      srcset={product.thumbnail.srcSet.attribute || undefined}
      {...product.thumbnail.attributes}
      alt={product.title}
      class="size-full object-cover"
    />
  {:else}
    <div class="grid size-full place-items-center text-brown-300">
      <Icon icon="mdi:image-outline" class="text-3xl" />
    </div>
  {/if}
{/snippet}

<div
  class="flex w-40 shrink-0 flex-col overflow-hidden rounded-xl border border-brown-200 bg-white"
>
  <div class="relative aspect-square bg-brown-50">
    {#if href}
      <a {href} class="block size-full">{@render thumb()}</a>
    {:else}
      {@render thumb()}
    {/if}
    {#if discount}
      <span
        class="absolute left-2 top-2 rounded-full bg-success-600 px-2 py-0.5 text-xs font-semibold text-white"
      >
        -{discount}%
      </span>
    {/if}
  </div>

  <div class="flex flex-1 flex-col gap-1 p-2">
    <p class="text-sm font-medium leading-tight text-dark">{product.title}</p>
    {#if product.price}
      <p class="text-xs text-brown-500">{product.price} Ft-tól</p>
    {/if}
    <button
      type="button"
      {disabled}
      onclick={onAdd}
      class={[
        "mt-auto flex items-center justify-center gap-1 rounded-full border px-2 py-1 text-xs font-medium transition-all",
        disabled ? "cursor-not-allowed border-brown-200 opacity-50" : "cursor-pointer",
        added > 0
          ? "border-success-600 bg-success-50 text-success-800 hover:bg-success-100"
          : "border-brown-300 hover:bg-brown-100",
      ]}
    >
      {#if added > 0}
        <Icon icon="mdi:check" class="shrink-0" />
        Kosárban{#if added > 1}&nbsp;({added}){/if}
      {:else if configurable}
        <Icon icon="mdi:cog-outline" class="shrink-0" />
        Beállítom
      {:else}
        <Icon icon="mdi:plus" class="shrink-0" />
        Hozzáadom
      {/if}
    </button>
  </div>
</div>
