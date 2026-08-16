<script lang="ts">
  import Icon from "@iconify/svelte";
  import IconButton from "./common/IconButton.svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import OrderItemMaterials from "./OrderItemMaterials.svelte";
  import OrderItemFields from "./OrderItemFields.svelte";
  import type { CmsEnhancedEmbroideryColor, CmsEnhancedProduct } from "@/lib/data";
  import type { IProduct } from "@/lib/types.svelte";
  import type { ActiveDiscountStatus, SetDiscountStatus } from "@/lib/priceUtils";
  import { areMaterialsComplete } from "@/lib/materialUtils";
  import OrderItemPrice from "./OrderItemPrice.svelte";

  interface Props extends HTMLAttributes<HTMLDivElement> {
    onClose?: (() => void) | undefined;
    product: IProduct;
    threadColors: CmsEnhancedEmbroideryColor[];
    onChange?: (product: IProduct) => void;
    relatedProducts?: CmsEnhancedProduct[];
    onAddRelated?: (target: CmsEnhancedProduct) => void;
    setDiscount?: ActiveDiscountStatus | undefined;
    relatedDiscounts?: Record<string, number>;
    setStatus?: SetDiscountStatus | undefined;
    basketCountByProductId?: Record<string, number>;
    onSyncToSet?: (() => void) | undefined;
    /** Drop the card chrome and title header so it reads as part of the page
     * (used on the product page, where the page already shows the title). */
    bare?: boolean;
  }

  let {
    onClose,
    product,
    threadColors,
    onChange,
    relatedProducts = [],
    onAddRelated,
    setDiscount,
    relatedDiscounts = {},
    setStatus,
    basketCountByProductId = {},
    onSyncToSet,
    bare = false,
    class: className,
    ...rest
  }: Props = $props();

  // Whether every required material slot has a material and its colors chosen.
  // Set siblings carry over the current selection, so adding one only makes
  // sense once it is complete.
  const materialsReady = $derived(areMaterialsComplete(product));
</script>

<div
  {...rest}
  class={[
    "flex flex-col w-full",
    bare ? "gap-4" : "gap-2 rounded-xl border shadow-md border-brown-200 p-2",
    className,
  ]}
>
  {#if !bare}
    <div class="flex items-center">
      <div class="flex items-center gap-2 flex-1 overflow-hidden">
        {#if product.icon}
          <div
            class="shrink-0 w-8 h-8 bg-brown-400 rounded-full flex items-center justify-center fill-white text-white"
          >
            <div
              class="bg-white w-6 h-6"
              style={`-webkit-mask-image: url(${product.icon.src}); mask-image: url(${product.icon.src}); -webkit-mask-size: contain; mask-size: contain; -webkit-mask-position: center; mask-position: center; -webkit-mask-repeat: no-repeat; mask-repeat: no-repeat;`}
            ></div>
          </div>
        {:else}
          <Icon icon="mdi:circle" class="text-brown-400 text-4xl shrink-0" />
        {/if}
        <p class="whitespace-nowrap overflow-hidden text-ellipsis">{product.title}</p>
      </div>
      {#if onClose}
        <IconButton class="shrink-0" type="button" onclick={onClose}>
          <Icon icon="mdi:close" />
        </IconButton>
      {/if}
    </div>
    <div class="w-full h-0.5 bg-brown-200"></div>
  {/if}
  <OrderItemFields {product} {threadColors} {onChange} />
  {#each Array.from({ length: product.materials.material_required_count }) as _, i (i)}
    <OrderItemMaterials {product} {onChange} material_index={i} />
  {/each}
  {#if relatedProducts.length > 0 && onAddRelated}
    <div class="w-full h-0.5 bg-brown-200"></div>
    <div class="flex flex-col gap-2">
      <p class="text-sm text-brown-500">Ezt is szeretnéd hozzáadni?</p>
      <div class="flex flex-wrap gap-2">
        {#each relatedProducts as related (related.product_id)}
          {@const added = basketCountByProductId[related.product_id] ?? 0}
          <button
            type="button"
            disabled={!materialsReady}
            class={[
              "flex items-center gap-1 rounded-full border py-1 px-3 text-sm transition-all",
              materialsReady ? "cursor-pointer" : "cursor-not-allowed opacity-50",
              added > 0
                ? "border-green-600 bg-green-50 text-green-800 hover:bg-green-100"
                : "border-brown-200 hover:bg-brown-100",
            ]}
            onclick={() => onAddRelated(related)}
          >
            {#if added > 0}
              <Icon icon="mdi:check" class="shrink-0" />
            {/if}
            {related.title}
            {#if added > 0}
              <span class="font-medium">({added})</span>
            {/if}
            {#if relatedDiscounts[related.product_id]}
              <span class="font-medium text-green-700"
                >-{relatedDiscounts[related.product_id]}%</span
              >
            {/if}
            <Icon icon="mdi:add" class="shrink-0" />
          </button>
        {/each}
      </div>
      {#if materialsReady}
        <p class="text-xs text-brown-400">
          A szett kedvezmény akkor jár, ha a darabokhoz ugyanazt az anyagot választod.
        </p>
      {:else}
        <p class="text-xs text-brown-400">
          Előbb válaszd ki az anyagot, a szett csak akkor érvényes ha az anyagok mind egyeznek.
        </p>
      {/if}
    </div>
  {/if}
  {#if setStatus && setStatus.state !== "active"}
    <div class="w-full h-0.5 bg-brown-200"></div>
    <div class="flex items-start gap-2 rounded-lg bg-brown-50 p-2 text-xs">
      <Icon icon="mdi:tag-outline" class="shrink-0 text-base text-brown-500" />
      <div class="flex flex-col items-start gap-1.5">
        {#if setStatus.state === "pending-partner"}
          <p>
            Add hozzá a csomaghoz a <span class="font-medium">{setStatus.setTitle}</span> szett egy
            másik darabját, és
            <span class="font-medium text-green-700">-{setStatus.percent}%</span> szett kedvezményt kapsz
            erre.
          </p>
        {:else}
          <p>
            Válaszd ugyanazt az anyagot a <span class="font-medium">{setStatus.setTitle}</span>
            szett másik darabjához, és
            <span class="font-medium text-green-700">-{setStatus.percent}%</span> szett kedvezményt kapsz
            erre.
          </p>
          {#if setStatus.canSync && onSyncToSet}
            <button
              type="button"
              class="flex items-center gap-1 rounded-full border border-brown-300 py-1 px-3 font-medium hover:bg-brown-100 transition-all cursor-pointer"
              onclick={onSyncToSet}
            >
              <Icon icon="mdi:sync" class="shrink-0" />
              Anyag egyeztetése a szetthez
            </button>
          {/if}
        {/if}
      </div>
    </div>
  {/if}
  <div class="w-full h-0.5 bg-brown-200"></div>
  <OrderItemPrice {product} {setDiscount} {onChange} />
</div>
