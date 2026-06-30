<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";

  interface Props extends Omit<HTMLInputAttributes, "type"> {}

  const { class: className, ...rest }: Props = $props();
</script>

<input type="checkbox" class={["toggle", className]} {...rest} />

<style lang="postcss">
  @reference "#global.css";

  .toggle {
    appearance: none;
    width: 2.75rem;
    height: 1.5rem;
    border-radius: 9999px;
    border: 1px solid var(--color-brown-200);
    background: var(--color-brown-50);
    position: relative;
    cursor: pointer;
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease,
      box-shadow 0.2s ease;
    vertical-align: middle;
  }

  .toggle::after {
    content: "";
    position: absolute;
    top: 1px;
    left: 1px;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 9999px;
    background: #fff;
    box-shadow: 0 1px 2px rgb(0 0 0 / 20%);
    transition: transform 0.2s ease;
  }

  .toggle:checked {
    background: var(--color-brown-400);
    border-color: var(--color-brown-500);
  }

  .toggle:checked::after {
    transform: translateX(1.25rem);
  }

  .toggle:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgb(var(--color-brown-500) / 35%);
  }

  .toggle:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
</style>
