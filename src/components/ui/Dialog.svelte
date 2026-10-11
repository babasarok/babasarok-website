<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    "aria-label": string;
    button: Snippet<[string]>;
    content: Snippet<[() => void]>;
    onClose?: () => void;
  }

  let { "aria-label": ariaLabel, button, content, onClose }: Props = $props();

  const id = crypto.randomUUID();
  let dialogEl: HTMLDialogElement;

  function close(): void {
    dialogEl.close();
  }
</script>

{@render button(id)}

<dialog
  bind:this={dialogEl}
  onclose={onClose}
  {id}
  closedby="any"
  aria-label={ariaLabel}
  class="m-auto w-[calc(100vw-2rem)] max-w-lg rounded-2xl border-0 bg-white p-5 shadow-xl overscroll-contain"
>
  {@render content(close)}
</dialog>

<style>
  dialog::backdrop {
    background-color: rgb(0 0 0 / 45%);
  }
</style>
