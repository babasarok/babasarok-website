<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  interface Props extends HTMLAttributes<HTMLDivElement> {
    onClose?: () => void;
    color?: string | undefined | null;
    bgImage?: string | undefined | null;
  }

  const { children, class: className, onClose, color, bgImage, ...rest }: Props = $props();
  const style = $derived(bgImage ? `background-image: url(${bgImage});` : undefined);
</script>

<div
  class={[
    "chip inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-gray-100 text-gray-800",
    className,
  ]}
  style={color ? `background-color: ${color}; color: contrast-color(${color});` : style}
  {...rest}
>
  {@render children?.()}
  {#if onClose}
    <button
      type="button"
      class="text-xs text-[constrast-color(var(--color))] hover:text-[constrast-color(var(--color))]/70 transition-opacity"
      style={`--color: ${color ?? "--color-gray-800"};`}
      onclick={onClose}
    >
      &times;
    </button>
  {/if}
</div>

<style>
  .chip {
    background-size: cover;
    background-position: center;
    -webkit-text-stroke: 3px white;
    paint-order: stroke fill;
  }
</style>
