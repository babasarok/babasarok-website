<script lang="ts">
  import Icon from "@iconify/svelte";
  import IconButton from "./common/IconButton.svelte";
  import { describeLine, type Labels } from "@/lib/basket/lineRows";
  import { formatMoney } from "@/lib/basket/money";
  import type { PriceChange } from "@/lib/basket/stale";
  import type { OrderLine } from "@/lib/basket/schemas";
  import { ASSET_BASE } from "@/lib/vendure/client";
  import { imageUrl } from "@/lib/vendure/imageUrl";

  interface Props {
    line: OrderLine;
    currencyCode: string;
    labels: Labels;
    priceChange: PriceChange | undefined;
    busy: boolean;
    onQuantity: (quantity: number) => void;
    onRemove: () => void;
  }

  let { line, currencyCode, labels, priceChange, busy, onQuantity, onRemove }: Props = $props();

  const product = $derived(line.productVariant.product);
  const rows = $derived(
    product.productDefinition
      ? describeLine(product.productDefinition, line.customFields?.selections ?? null, labels)
      : []
  );
  const thumbnail = $derived(
    product.featuredAsset ? imageUrl(product.featuredAsset.source, "card-sm", ASSET_BASE) : null
  );
</script>

<article
  class={[
    "flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm transition-all",
    line.invalidReason ? "border-danger-500" : "border-brown-200",
  ]}
  data-testid="checkout-line"
>
  <div class="flex items-start gap-3">
    {#if thumbnail}
      <img src={thumbnail} alt={product.name} class="size-16 shrink-0 rounded-lg object-cover" />
    {:else}
      <div class="grid size-16 shrink-0 place-items-center rounded-lg bg-brown-50 text-brown-300">
        <Icon icon="mdi:image-outline" class="text-2xl" />
      </div>
    {/if}
    <h3 class="min-w-0 flex-1 text-base font-medium leading-tight text-dark">{product.name}</h3>
  </div>

  {#if line.invalidReason}
    <p class="flex items-start gap-1 rounded-lg bg-danger-50 p-2 text-sm text-danger-500">
      <Icon icon="mdi:alert-circle" class="mt-0.5 shrink-0" />
      {line.invalidReason.message}
    </p>
  {/if}

  {#if priceChange}
    <p class="flex items-start gap-1 rounded-lg bg-warning-50 p-2 text-sm text-warning-800">
      <Icon icon="mdi:alert-circle" class="mt-0.5 shrink-0" />
      Az oldalon látott ár ({formatMoney(priceChange.shown, currencyCode)}) megváltozott; a
      jelenlegi egységár: {formatMoney(priceChange.actual, currencyCode)}.
    </p>
  {/if}

  {#if rows.length > 0}
    <dl class="flex flex-col gap-1 border-t border-brown-100 pt-3 text-sm">
      {#each rows as row (row.label)}
        <div class="flex justify-between gap-4">
          <dt class="text-brown-500">{row.label}</dt>
          <dd class="text-right text-dark">{row.value}</dd>
        </div>
      {/each}
    </dl>
  {/if}

  <div class="flex items-center justify-between border-t border-brown-100 pt-3">
    <div class="flex items-center gap-3 text-sm">
      <a
        href={`/product/${product.slug}/?line=${line.id}`}
        class="flex items-center gap-1 font-medium text-brown-600 transition-colors hover:text-brown-700"
      >
        <Icon icon="mdi:pencil" class="shrink-0" />
        Szerkesztés
      </a>
      <button
        type="button"
        onclick={onRemove}
        disabled={busy}
        class="flex cursor-pointer items-center gap-1 text-brown-500 transition-colors hover:text-red-600"
      >
        <Icon icon="mdi:delete-outline" class="shrink-0" />
        Törlés
      </button>
    </div>
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-1">
        <IconButton
          type="button"
          aria-label="Mennyiség csökkentése"
          disabled={busy || line.quantity <= 1}
          onclick={() => onQuantity(line.quantity - 1)}
        >
          <Icon icon="mdi:minus" />
        </IconButton>
        <span class="text-sm select-none">{line.quantity} db</span>
        <IconButton
          type="button"
          aria-label="Mennyiség növelése"
          disabled={busy}
          onclick={() => onQuantity(line.quantity + 1)}
        >
          <Icon icon="mdi:add" />
        </IconButton>
      </div>
      <p class="text-right font-medium text-dark">
        {formatMoney(line.discountedLinePriceWithTax, currencyCode)}
      </p>
    </div>
  </div>
</article>
