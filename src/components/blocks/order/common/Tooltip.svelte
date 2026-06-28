<script lang="ts">
  import {
    FloatingArrow,
    arrow,
    autoUpdate,
    flip,
    autoPlacement,
    offset,
    shift,
    useDismiss,
    useFloating,
    useHover,
    useInteractions,
    useRole,
    type UseInteractionsReturn,
  } from "@skeletonlabs/floating-ui-svelte";
  import type { HTMLAttributes, HTMLObjectAttributes } from "svelte/elements";

  import { fade } from "svelte/transition";

  interface Props {
    children: import("svelte").Snippet;
    content: import("svelte").Snippet;
    contentProps?: HTMLAttributes<HTMLDivElement>;
    disabled?: boolean;
  }

  let { children, content, contentProps, disabled }: Props = $props();

  // State
  let open = $state(false);
  let elemArrow: HTMLElement | null = $state(null);

  // Use Floating
  const floating = useFloating({
    whileElementsMounted: autoUpdate,
    get open() {
      return open;
    },
    onOpenChange: (v) => {
      open = v;
    },
    placement: "top",
    get middleware() {
      return [
        offset(10),
        flip(),
        shift({ padding: 5, mainAxis: true }),
        elemArrow && arrow({ element: elemArrow }),
      ];
    },
  });

  // Interactions
  const role = useRole(floating.context, { role: "tooltip" });
  const hover = useHover(floating.context, { move: false });
  const dismiss = useDismiss(floating.context);
  const interactions = useInteractions([role, hover, dismiss]);
</script>

<!-- Reference Element -->
<div
  {...contentProps}
  bind:this={floating.elements.reference}
  {...interactions.getReferenceProps()}
>
  {@render children?.()}
</div>
<!-- Floating Element -->
{#if open && !disabled}
  <div
    bind:this={floating.elements.floating}
    style={floating.floatingStyles}
    {...interactions.getFloatingProps()}
    class="rounded-md bg-bg-secondary p-2 text-sm shadow-lg z-50 transition-opacity"
    transition:fade={{ duration: 200 }}
  >
    {@render content?.()}
    <FloatingArrow
      bind:ref={elemArrow}
      context={floating.context}
      fill="#EDE6DF"
      className="fill-bg-secondary"
    />
  </div>
{/if}
