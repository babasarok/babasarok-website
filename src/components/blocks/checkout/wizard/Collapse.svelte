<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    open: boolean;
    children: Snippet;
  }

  let { open, children }: Props = $props();
</script>

<div
  inert={!open}
  aria-hidden={open ? undefined : "true"}
  class="grid transition-[grid-template-rows] duration-200 ease-out {open
    ? 'grid-rows-[1fr]'
    : 'grid-rows-[0fr]'}"
>
  <div class="overflow-hidden min-h-0">
    {@render children()}
  </div>
</div>
