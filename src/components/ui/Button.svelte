<script lang="ts">
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";
  import { cn } from "@/lib/cn";

  type Attributes = Omit<HTMLAnchorAttributes, "href" | "type"> &
    Omit<HTMLButtonAttributes, "type">;

  interface Props extends Attributes {
    href?: string | undefined;
    type?: "button" | "submit" | "reset" | undefined;
    variant?: "primary" | "secondary" | "outline" | "outline-secondary";
    size?: "sm" | "md" | "lg";
    block?: boolean;
  }

  const {
    children,
    class: className,
    href,
    type = "button",
    disabled,
    variant = "primary",
    size = "md",
    block = false,
    ...rest
  }: Props = $props();

  const classes = $derived(
    cn([
      "inline-block text-center align-middle select-none cursor-pointer shadow-lg",
      "border border-solid font-normal leading-[1.5]",
      "transition-all",
      "hover:scale-[1.03]",
      "focus:outline-none focus:ring-3",
      "disabled:opacity-65 disabled:pointer-events-none",
      "aria-disabled:opacity-65 aria-disabled:pointer-events-none",
      variant === "primary" &&
        "text-dark bg-sand-300 border-sand-300 hover:bg-sand-400 hover:border-sand-400 focus:ring-sand-300/50",
      variant === "secondary" &&
        "bg-white border-white hover:bg-muted hover:border-muted focus:ring-light/50 text-sand-300",
      variant === "outline" &&
        "text-sand-300 bg-transparent border-sand-300 hover:bg-sand-300 hover:text-dark focus:ring-sand-300/50",
      variant === "outline-secondary" &&
        "text-accent bg-transparent border-accent hover:bg-accent hover:text-white focus:ring-accent/50",
      size === "sm" && "px-2 py-1 rounded-[0.2rem]",
      size === "md" && "px-3 py-[0.375rem] text-base rounded-[0.25rem]",
      size === "lg" && "px-6 py-4 rounded-lg text-base",
      block && "block w-full",
      className,
    ])
  );
</script>

{#if href}
  <a {...rest} {href} class={classes} aria-disabled={disabled ? "true" : undefined}>
    {@render children?.()}
  </a>
{:else}
  <button {...rest} {type} {disabled} class={classes}>
    {@render children?.()}
  </button>
{/if}
