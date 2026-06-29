<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { twMerge } from "tailwind-merge";
  import { clsx } from "clsx";
  interface Props extends HTMLButtonAttributes {}

  const { children, class: className, ...rest }: Props = $props();
</script>

<button
  class={twMerge(
    clsx(
      "cursor-pointer disabled:cursor-not-allowed text-2xl text-primary-500 rounded-full hover:bg-border transition-all leading-none disabled:text-gray-500",
      className
    )
  )}
  {...rest}
>
  {@render children?.()}
</button>
