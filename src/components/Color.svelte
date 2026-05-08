<script lang="ts">
    import IconButton from "./IconButton.svelte";
    import Tooltip from "./Tooltip.svelte";

    interface Props {
        color: { color_id: string; hex?: string; label?: string };
        selected?: boolean;
        onclick?: (color_id: string) => void;
        disabled?: boolean;
    }

    const { color, selected = false, onclick, disabled }: Props = $props();
</script>

<Tooltip {disabled}>
    {#snippet content()}
        {color.label || color.color_id}
    {/snippet}
    <IconButton type="button" {disabled} aria-selected={selected} onclick={() => onclick?.(color.color_id)}>
        <div
            class={[
                "size-5 border-2 rounded-full transition-all p-px",
                selected ? "border-primary-500" : "border-transparent",
                disabled ? "" : "hover:border-primary-400",
            ]}>
            <div class="rounded-full h-full w-full" style={`background-color: ${color.hex}`}></div>
        </div>
    </IconButton>
</Tooltip>
