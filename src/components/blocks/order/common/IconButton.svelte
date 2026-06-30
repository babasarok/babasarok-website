<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { cn } from "@/lib/cn";
  interface Props extends HTMLButtonAttributes {}

  const { children, class: className, ...rest }: Props = $props();
</script>

<button
  class={cn(
    "cursor-pointer disabled:cursor-not-allowed text-2xl text-brown-500 rounded-full hover:bg-brown-200 transition-all leading-none disabled:text-gray-500",
    className
  )}
  {...rest}
>
  {@render children?.()}
</button>
