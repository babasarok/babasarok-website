<script lang="ts">
  import type { HTMLImgAttributes } from "svelte/elements";
  import { ASSET_BASE } from "@/lib/vendure/client";
  import { imageSrcSet, imageUrl, type ImagePreset } from "@/lib/vendure/imageUrl";

  interface Props extends Omit<HTMLImgAttributes, "src" | "srcset" | "alt"> {
    /** Vendure asset source (see `imageUrl`). */
    src: string;
    alt: string;
    presets: readonly [ImagePreset, ...ImagePreset[]];
  }

  let { src, alt, presets, ...attributes }: Props = $props();

  const largest = $derived(presets.at(-1) ?? presets[0]);
</script>

<img
  src={imageUrl(src, largest, ASSET_BASE)}
  srcset={imageSrcSet(src, presets, ASSET_BASE)}
  {alt}
  decoding="async"
  {...attributes}
/>
