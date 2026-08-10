<script lang="ts">
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";
  import { cn } from "@/lib/cn";

  type Props =
    ({ href?: never } & HTMLButtonAttributes) | ({ href: string } & HTMLAnchorAttributes);

  const { children, class: className, href, ...rest }: Props = $props();

  const classes =
    "cursor-pointer disabled:cursor-not-allowed text-2xl text-brown-500 rounded-full hover:bg-brown-200 transition-all leading-none disabled:text-gray-500";
</script>

<svelte:element
  this={href == null ? "button" : "a"}
  class={cn(classes, className)}
  {href}
  {...rest}
>
  {@render children?.()}
</svelte:element>
