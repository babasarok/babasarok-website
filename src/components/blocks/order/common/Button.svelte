<script lang="ts">
  import clsx from "clsx";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { twMerge } from "tailwind-merge";
  interface Props extends HTMLButtonAttributes {
    selected?: boolean;
    variant?: "outlined" | "text" | "contained";
  }

  const { children, class: className, selected, variant = "outlined", ...rest }: Props = $props();
</script>

<button
  class={twMerge(
    clsx([
      "text-sm font-medium transition-all rounded-md cursor-pointer disabled:cursor-not-allowed",
      {
        "border text-foreground border-border  px-3 py-1 hover:bg-primary-500 disabled:bg-transparent disabled:text-foreground hover:text-surface":
          variant === "outlined",
        "bg-primary-500 text-surface": selected && variant === "outlined",
        "text-primary-500 hover:text-primary-700": variant === "text",
        "text-primary-700": selected && variant === "text",
        "bg-primary-500 text-surface hover:bg-primary-700 disabled:text-gray-500 disabled:bg-gray-300 disabled:hover:bg-gray-300 px-3 py-1":
          variant === "contained",
      },
      className,
    ])
  )}
  {...rest}
>
  {@render children?.()}
</button>
