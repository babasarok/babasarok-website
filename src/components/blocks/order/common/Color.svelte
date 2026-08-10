<script lang="ts">
  import type { SlimImage } from "@/lib/data";
  import IconButton from "./IconButton.svelte";
  import Tooltip from "./Tooltip.svelte";

  interface Props {
    color: {
      color_id: string;
      hex?: string | undefined | null;
      label?: string | undefined | null;
      image?: SlimImage | undefined | null;
    };
    selected?: boolean;
    onclick?: (color_id: string) => void;
    disabled?: boolean;
  }

  const { color, selected = false, onclick, disabled = false }: Props = $props();
</script>

<Tooltip {disabled}>
  {#snippet content()}
    <div class="flex flex-col items-center gap-1.5">
      <div class="size-24 overflow-hidden rounded-lg border border-brown-300">
        {#if color.image}
          <img
            src={color.image.src}
            srcset={color.image.srcSet.attribute || undefined}
            {...color.image.attributes}
            alt=""
            class="block size-full object-cover"
          />
        {:else}
          <div class="size-full" style={`background-color: ${color.hex ?? ""}`}></div>
        {/if}
      </div>
      <span class="text-center">{color.label || color.color_id}</span>
    </div>
  {/snippet}
  <IconButton
    type="button"
    {disabled}
    aria-selected={selected}
    onclick={() => onclick?.(color.color_id)}
  >
    <div
      class={[
        "size-6 border-2 rounded-full transition-all p-px",
        selected ? "border-brown-500" : "border-transparent",
        disabled ? "" : "hover:border-brown-400",
      ]}
    >
      {#if color.image}
        <img
          src={color.image.src}
          srcset={color.image.srcSet.attribute || undefined}
          {...color.image.attributes}
          alt=""
          class="block size-full rounded-full object-cover"
        />
      {:else}
        <div
          class="rounded-full h-full w-full"
          style={`background-color: ${color.hex ?? ""}`}
        ></div>
      {/if}
    </div>
  </IconButton>
</Tooltip>
