<script lang="ts">
  import type { HTMLImgAttributes } from "svelte/elements";
  import { ASSET_BASE } from "@/lib/vendure/client";
  import {
    imageSrcSet,
    imageUrl,
    type ImagePreset,
    type VendureAsset,
  } from "@/lib/vendure/imageUrl";

  interface Props extends Omit<HTMLImgAttributes, "src" | "srcset" | "alt"> {
    /** Vendure asset (see `imageUrl`). */
    asset: VendureAsset;
    alt: string;
    presets: readonly [ImagePreset, ...ImagePreset[]];
  }

  let { asset, alt, presets, ...attributes }: Props = $props();

  const largest = $derived(presets.at(-1) ?? presets[0]);
</script>

<img
  src={imageUrl(asset.source, largest, ASSET_BASE, asset.focalPoint)}
  srcset={imageSrcSet(asset.source, presets, ASSET_BASE, asset.focalPoint)}
  {alt}
  decoding="async"
  {...attributes}
/>
