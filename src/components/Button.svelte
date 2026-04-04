<script lang="ts">
    import type { HTMLButtonAttributes } from "svelte/elements";
    interface Props extends HTMLButtonAttributes {
        selected?: boolean;
        variant?: "outlined" | "text" | "contained";
    }

    const { children, class: className, selected, variant = "outlined", ...rest }: Props = $props();
</script>

<button
    class={[
        "text-sm font-medium transition-all rounded-md",
        {
            "border text-foreground border-border  px-3 py-1 hover:bg-primary-500 hover:text-surface":
                variant === "outlined",
            "bg-primary-500 text-surface": selected && variant === "outlined",
            "text-primary-500 hover:text-primary-700": variant === "text",
            "text-primary-700": selected && variant === "text",
            "bg-primary-500 text-surface hover:bg-primary-700 disabled:text-gray-700 disabled:bg-gray-400 disabled:hover:bg-gray-400 px-3 py-1":
                variant === "contained",
        },
        className,
    ]}
    {...rest}>
    {@render children?.()}
</button>
