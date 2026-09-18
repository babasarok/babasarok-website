<script lang="ts">
  import type { Snippet } from "svelte";
  import { fly } from "svelte/transition";

  interface Props {
    open: boolean;
    "aria-label": string;
    onOpenChange: (open: boolean) => void;
    content: Snippet;
  }

  let { open, "aria-label": ariaLabel, onOpenChange, content }: Props = $props();

  const DURATION = 200;

  let dialog: HTMLDialogElement | undefined = $state();

  /** Increments per open; lets a pending close timer know it was superseded. */
  let closeTimer = 0;

  $effect(() => {
    const element = dialog;
    if (!element) {
      return;
    }
    const onDialogClose = (): void => {
      // A close we did not initiate (e.g. Escape): sync the parent state.
      if (open) {
        onOpenChange(false);
      }
    };
    element.addEventListener("close", onDialogClose);
    return () => {
      element.removeEventListener("close", onDialogClose);
    };
  });

  $effect.pre(() => {
    if (!open) {
      return;
    }
    // Open before the render below adds the panel, so its in:fly measures a
    // visible element instead of a display:none dialog.
    dialog?.showModal();
    return () => {
      // Let the panel's out transition finish before closing the dialog,
      // skipping the close if the sheet was reopened in the meantime.
      const token = ++closeTimer;
      globalThis.setTimeout(() => {
        if (closeTimer === token) {
          dialog?.close();
        }
      }, DURATION);
    };
  });
</script>

<dialog
  bind:this={dialog}
  aria-label={ariaLabel}
  class="fixed inset-0 m-0 h-full w-screen max-h-none max-w-none overflow-hidden border-0 bg-transparent p-0"
  onclick={(event) => {
    if (event.target === dialog) {
      onOpenChange(false);
    }
  }}
>
  {#if open}
    <div
      class="absolute inset-x-0 bottom-0 max-h-[80dvh] w-full overflow-y-auto rounded-t-2xl bg-light p-5"
      in:fly={{ y: "100%", duration: DURATION }}
      out:fly={{ y: "100%", duration: DURATION }}
    >
      {@render content()}
    </div>
  {/if}
</dialog>

<style>
  dialog::backdrop {
    background-color: rgb(0 0 0 / 45%);
  }
</style>
