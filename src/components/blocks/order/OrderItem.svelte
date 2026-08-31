<script lang="ts">
  import Icon from "@iconify/svelte";
  import IconButton from "./common/IconButton.svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import OrderItemMaterials from "./OrderItemMaterials.svelte";
  import OrderItemFields from "./OrderItemFields.svelte";
  import type { CmsEnhancedEmbroideryColor } from "@/lib/data";
  import type { IProduct } from "@/lib/types.svelte";
  import type { SetCoverageEntry } from "@/lib/priceUtils";
  import OrderItemPrice from "./OrderItemPrice.svelte";

  interface Props extends HTMLAttributes<HTMLDivElement> {
    onClose?: (() => void) | undefined;
    product: IProduct;
    threadColors: CmsEnhancedEmbroideryColor[];
    onChange?: (product: IProduct) => void;
    setCoverage?: SetCoverageEntry[] | undefined;
    /** Drop the card chrome and title header so it reads as part of the page
     * (used on the product page, where the page already shows the title). */
    bare?: boolean;
  }

  let {
    onClose,
    product,
    threadColors,
    onChange,
    setCoverage,
    bare = false,
    class: className,
    ...rest
  }: Props = $props();
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
  <div class="w-full h-0.5 bg-brown-200"></div>
  <OrderItemPrice {product} {setCoverage} {onChange} />
</div>
