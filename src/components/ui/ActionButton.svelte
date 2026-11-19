<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { cn } from "@/lib/cn";
  interface Props extends HTMLButtonAttributes {
    selected?: boolean;
    variant?: "outlined" | "text" | "contained";
  }

  const { children, class: className, selected, variant = "outlined", ...rest }: Props = $props();
</script>

<button
  class={cn([
    "text-sm font-medium transition-all rounded-md cursor-pointer disabled:cursor-not-allowed",
    {
      "border text-body border-brown-200  px-3 py-1 hover:bg-brown-500 disabled:bg-transparent disabled:text-gray-400 disabled:border-gray-200 hover:text-white":
        variant === "outlined",
      "bg-brown-500 text-white": selected && variant === "outlined",
      "text-brown-500 hover:text-brown-700": variant === "text",
      "text-brown-700": selected && variant === "text",
      "bg-brown-500 text-white hover:bg-brown-700 disabled:text-gray-500 disabled:bg-gray-300 disabled:hover:bg-gray-300 px-3 py-1":
        variant === "contained",
    },
    className,
  ])}
  {...rest}
>
  {@render children?.()}
</button>
