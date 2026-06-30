<script lang="ts">
  import {
    FloatingArrow,
    arrow,
    autoUpdate,
    flip,
    offset,
    shift,
    useDismiss,
    useFloating,
    useHover,
    useInteractions,
    useRole,
  } from "@skeletonlabs/floating-ui-svelte";
  import type { HTMLAttributes } from "svelte/elements";
  import type { Snippet } from "svelte";

  import { fade } from "svelte/transition";

  interface Props {
    children: Snippet;
    content: Snippet;
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
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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
  {@render children()}
</div>
<!-- Floating Element -->
{#if open && !disabled}
  <div
    bind:this={floating.elements.floating}
    style={floating.floatingStyles}
    {...interactions.getFloatingProps()}
    class="rounded-md bg-brown-100 p-2 text-sm shadow-lg z-50 transition-opacity"
    transition:fade={{ duration: 200 }}
  >
    {@render content()}
    <FloatingArrow
      bind:ref={elemArrow}
      context={floating.context}
      fill="#EDE6DF"
      className="fill-brown-100"
    />
  </div>
{/if}
