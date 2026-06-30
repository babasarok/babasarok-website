<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import { cn } from "@/lib/cn";

  interface Props extends HTMLInputAttributes {
    value?: string | undefined;
  }

  let { value = $bindable(), class: className, ...rest }: Props = $props();
</script>

<input
  class={cn(
    "text-sm border rounded bg-white px-2 py-1 border-brown-200 w-full focus:outline-none focus:ring-2 focus:ring-sand-300/40 transition-all",
    className
  )}
  bind:value
  {...rest}
/>
