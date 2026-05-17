<script lang="ts">
    import type { HTMLAttributes } from "svelte/elements";
    interface Props extends HTMLAttributes<HTMLDivElement> {
        onClose?: () => void;
        color?: string;
    }

    const { children, class: className, onClose, color, ...rest }: Props = $props();
</script>

<div>
    <div
        class={["inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm bg-gray-100 text-gray-800", className]}
        style={color ? `background-color: ${color}; color: contrast-color(${color});` : undefined}
        {...rest}>
        {@render children?.()}
        {#if onClose}
            <button
                type="button"
                class="text-xs text-[constrast-color(var(--color))] hover:text-[constrast-color(var(--color))]/70 transition-opacity"
                style={`--color: ${color ?? "--color-gray-800"};`}
                onclick={onClose}>
                &times;
            </button>
        {/if}
    </div>
</div>
