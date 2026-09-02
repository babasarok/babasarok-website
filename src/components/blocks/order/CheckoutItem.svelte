<script lang="ts">
  import Icon from "@iconify/svelte";
  import { calculatePriceForItem } from "@/lib/pricing/price";
  import { isFieldVisible } from "@/lib/product/fieldVisibility";
  import type { CmsEnhancedEmbroideryColor } from "@/lib/data";
  import type { Field, IProduct, ProductMaterialValue } from "@/lib/types.svelte";
  import type { SetCoverageEntry } from "@/lib/pricing/setDiscount";

  interface Props {
    product: IProduct;
    threadColors: CmsEnhancedEmbroideryColor[];
    /** Product page link (with `?uuid=…`) that re-opens this item for editing. */
    editHref: string | undefined;
    /** Set-discount coverage for this line; drives the discounted price. */
    setCoverage?: SetCoverageEntry[] | undefined;
    /** Emphasise this line while its set discount is hovered in the deals panel. */
    highlighted?: boolean;
    onRemove: () => void;
  }

  let { product, threadColors, editHref, setCoverage, highlighted, onRemove }: Props = $props();

  const price = $derived(calculatePriceForItem(product, setCoverage));

  // Per-set money this line saves, one row per covering set. The undiscounted
  // unit price times the set's percent and covered units (matches the total's
  // averaged factor, so the rows sum to the line's whole set discount).
  const setDiscountRows = $derived.by(() => {
    const unitPrice = price.unitPrice;
    if (!setCoverage || unitPrice === undefined) {
      return [];
    }
    return setCoverage.map((entry) => ({
      setTitle: entry.setTitle,
      percent: entry.percent,
      count: entry.count,
      money: Math.round((unitPrice * entry.percent * entry.count) / 100),
    }));
  });

  /** Per-option price contribution, keyed by the same label as the summary rows. */
  const priceByLabel = $derived.by(() => {
    const map: Record<string, number | undefined> = {};
    for (const part of price.options) {
      map[part.label] = part.price;
    }
    return map;
  });

  /** The selected, human-readable value of a field, or `undefined` to hide it. */
  function fieldDisplay(field: Field): string | undefined {
    switch (field.type) {
      case "toggle": {
        return field.value?.value ? "Igen" : undefined;
      }
      case "embroidery": {
        if (!field.value?.enabled) {
          return undefined;
        }
        const color = threadColors.find((c) => c.color_id === field.value?.color.color);
        const colorLabel = color?.label ?? field.value.color.color;
        const text = field.value.text.value.trim();
        return colorLabel ? `${text} (${colorLabel})`.trim() : text;
      }
      default: {
        const value = field.value?.value;
        if (!value) {
          return undefined;
        }
        if (field.value?.is_custom) {
          return `Egyedi: ${value}`;
        }
        const option = "items" in field ? field.items?.find((o) => o?.value === value) : undefined;
        return option?.label ?? value;
      }
    }
  }

  const fieldRows = $derived(
    product.fields
      .filter((f) => isFieldVisible(f, product.fields))
      .map((f) => ({ label: f.label || f.name, value: fieldDisplay(f) }))
      .filter((row): row is { label: string; value: string } => row.value != null)
  );

  /** The chosen material + colours for one material slot, or `undefined`. */
  function materialDisplay(value: ProductMaterialValue | undefined): string | undefined {
    if (!value?.material_id) {
      return undefined;
    }
    const material = product.materials.materials.find(
      (m) => m?.material_path.material_id === value.material_id
    );
    const name = material?.material_path.label ?? value.material_id;
    const colors = value.colors
      .map((id) => material?.material_path.colors?.find((c) => c.color_id === id)?.label ?? id)
      .join(", ");
    return colors ? `${name} (${colors.trim()})` : name;
  }

  const materialRows = $derived(
    Array.from({ length: product.materials.material_required_count }, (_, i) => ({
      label: product.materials.material_required_count > 1 ? `Anyag ${i + 1}` : "Anyag",
      value: materialDisplay(product.materials.values[i]),
    })).filter((row): row is { label: string; value: string } => row.value != null)
  );
</script>

<article
  class={[
    "flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm transition-all",
    highlighted ? "border-success-500 ring-2 ring-success-500" : "border-brown-200",
  ]}
>
  <div class="flex items-start gap-3">
    {#if product.thumbnail}
      <img
        src={product.thumbnail.src}
        srcset={product.thumbnail.srcSet.attribute || undefined}
        {...product.thumbnail.attributes}
        alt={product.title}
        class="size-16 shrink-0 rounded-lg object-cover"
      />
    {:else if product.icon}
      <div class="grid size-16 shrink-0 place-items-center rounded-lg bg-brown-50 text-brown-400">
        <div
          class="size-8 bg-brown-400"
          style={`mask-image:url(${product.icon.src});mask-size:contain;mask-position:center;mask-repeat:no-repeat;-webkit-mask-image:url(${product.icon.src});-webkit-mask-size:contain;-webkit-mask-position:center;-webkit-mask-repeat:no-repeat;`}
        ></div>
      </div>
    {:else}
      <div class="grid size-16 shrink-0 place-items-center rounded-lg bg-brown-50 text-brown-300">
        <Icon icon="mdi:image-outline" class="text-2xl" />
      </div>
    {/if}

    <div class="flex min-w-0 flex-1 flex-col">
      <div class="flex items-start justify-between gap-2">
        <h3 class="text-base font-medium leading-tight text-dark">{product.title}</h3>
        <span class="shrink-0 text-sm text-brown-500">{product.count} db</span>
      </div>
    </div>
  </div>

  <dl class="flex flex-col gap-1 border-t border-brown-100 pt-3 text-sm">
    <div class="flex justify-between gap-4">
      <dt class="text-brown-500">Alapár</dt>
      <dd class="text-right text-dark">
        {price.basePrice.price === undefined ? "??" : `${price.basePrice.price} Ft`}
        {#if price.priced_by_length}/m{/if}
      </dd>
    </div>
    {#each fieldRows as row (row.label)}
      <div class="flex justify-between gap-4">
        <dt class="text-brown-500">{row.label}</dt>
        <dd class="text-right text-dark">
          {row.value}
          {#if priceByLabel[row.label]}
            <span class="ml-1 whitespace-nowrap text-xs font-medium text-sand-700"
              >+{priceByLabel[row.label]} Ft</span
            >
          {/if}
        </dd>
      </div>
    {/each}
    {#each materialRows as row (row.label)}
      <div class="flex justify-between gap-4">
        <dt class="text-brown-500">{row.label}</dt>
        <dd class="text-right text-dark">
          {row.value}
          {#if priceByLabel[row.label]}
            <span class="ml-1 whitespace-nowrap text-xs font-medium text-sand-700"
              >+{priceByLabel[row.label]} Ft</span
            >
          {/if}
        </dd>
      </div>
    {/each}
    {#if price.discountInfo !== undefined && price.discountInfo.discountSource === "standalone"}
      <div class="flex justify-between gap-4">
        <dt class="text-brown-500">Kedvezmény</dt>
        <dd class="text-right font-medium text-green-700">
          −{(price.discountInfo.percent / 100).toLocaleString("hu-HU", {
            style: "percent",
          })}
          {#if price.discountInfo.discountAppliedCount < product.count}
            ({price.discountInfo.discountAppliedCount} db)
          {/if}
        </dd>
      </div>
    {/if}
    {#each setDiscountRows as row (row.setTitle)}
      <div class="flex justify-between gap-4">
        <dt class="text-brown-500">
          Szett kedvezmény <span class="text-brown-400">({row.setTitle} −{row.percent}%)</span>
        </dt>
        <dd class="text-right font-medium text-green-700">
          −{row.money.toLocaleString("hu-HU")} Ft
          {#if row.count < product.count}
            ({row.count} db)
          {/if}
        </dd>
      </div>
    {/each}
  </dl>

  <div class="flex items-center justify-between border-t border-brown-100 pt-3">
    <div class="flex items-center gap-3 text-sm">
      {#if editHref}
        <a
          href={editHref}
          class="flex items-center gap-1 font-medium text-brown-600 transition-colors hover:text-brown-700"
        >
          <Icon icon="mdi:pencil" class="shrink-0" />
          Szerkesztés
        </a>
      {/if}
      <button
        type="button"
        onclick={onRemove}
        class="flex cursor-pointer items-center gap-1 text-brown-500 transition-colors hover:text-red-600"
      >
        <Icon icon="mdi:delete-outline" class="shrink-0" />
        Törlés
      </button>
    </div>
    <p class="text-right font-medium text-dark">
      {price.totalPrice === undefined ? "--" : `${price.totalPrice} Ft`}
    </p>
  </div>
</article>
