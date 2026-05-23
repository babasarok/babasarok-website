<script lang="ts">
    import type { HTMLButtonAttributes } from "svelte/elements";
    interface Props extends HTMLButtonAttributes {}

    const { children, class: className, ...rest }: Props = $props();
</script>

<button
    class={[
        "text-2xl text-primary-500 rounded-full hover:bg-border transition-all leading-none disabled:text-gray-500",
        className,
    ]}
    {...rest}>
    {@render children?.()}
</button>
