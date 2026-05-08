<script lang="ts">
    import type { HTMLInputAttributes } from "svelte/elements";

    interface Props extends Omit<HTMLInputAttributes, "type"> {}

    const { class: className, ...rest }: Props = $props();
</script>

<input type="checkbox" class={["toggle", className]} {...rest} />
