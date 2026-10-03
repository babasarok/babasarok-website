<script lang="ts">
  import Button from "./common/Button.svelte";
  import Chip from "./common/Chip.svelte";
  import Icon from "@iconify/svelte";
  import Color from "./common/Color.svelte";
  import IconButton from "./common/IconButton.svelte";
  import Tooltip from "./common/Tooltip.svelte";
  import { slide } from "svelte/transition";
  import type { IProduct, MaterialField } from "@/lib/types.svelte";
  import { resolveColorCount } from "@/lib/product/materials";

  /**
   * The control for a `material` field: pick one of the field's `materials`,
   * then pick its colours (single, or a running list when `color_count` > 1).
   *
   * The field label and the value's error are rendered by `OrderItemFields`, so
   * this only renders the picker. It mirrors the UX of the standalone material
   * slots; `color_count` may name another field, so it is resolved against the
   * whole product via {@link resolveColorCount}.
   */
  interface Props {
    product: IProduct;
    field: MaterialField;
    onChange?: ((product: IProduct) => void) | undefined;
  }

  const { product, field, onChange }: Props = $props();

  const materials = $derived(
    (field.materials ?? []).filter((m): m is NonNullable<typeof m> => m != null)
  );
  const colorCount = $derived(resolveColorCount({ color_count: field.color_count }, product));
  const multiColor = $derived((colorCount ?? 0) > 1);

  const selectedMaterial = $derived(
    field.value?.material_id
      ? materials.find((m) => m.material_path.material_id === field.value?.material_id)
      : undefined
  );
  const materialInfo = $derived(selectedMaterial?.material_path);

  /** Pick a material and reset its colour selection. */
  function selectMaterial(material_id: string): void {
    field.value = { material_id, colors: [] };
    onChange?.(product);
  }

  function addColor(color_id: string): void {
    if (!field.value) {
      return;
    }
    field.value.colors = multiColor ? [...field.value.colors, color_id] : [color_id];
    onChange?.(product);
  }

  function removeColor(index: number): void {
    if (!field.value) {
      return;
    }
    field.value.colors = [
      ...field.value.colors.slice(0, index),
      ...field.value.colors.slice(index + 1),
    ];
    onChange?.(product);
  }
</script>

{#if materials.length > 0}
  <div class="flex flex-col gap-2">
    <div class="flex gap-1 flex-wrap">
      {#each materials as material (material.material_path.material_id)}
        {@const materialInfo = material.material_path}
        {@const selected = field.value?.material_id === materialInfo.material_id}
        <Button
          type="button"
          class="flex items-center gap-0.5"
          {selected}
          onclick={() => selectMaterial(materialInfo.material_id)}
        >
          {materialInfo.label || materialInfo.material_id}
          {#if material.price}
            <span class="text-xs font-medium whitespace-nowrap opacity-70"
              >+{material.price} Ft</span
            >
          {/if}
        </Button>
      {/each}
    </div>
    {#if field.value?.material_id && materialInfo}
      <div class="flex flex-col" transition:slide>
        <p class="text-sm text-brown-500 flex items-center gap-1 justify-between">
          <span class="flex items-center gap-1">
            Szín
            {#if (materialInfo.colors?.length ?? 0) > 0}
              <Tooltip contentProps={{ class: "inline-flex" }}>
                {#snippet content()}
                  Összes szín megtekintése
                {/snippet}
                <IconButton
                  href={`/material/${materialInfo.material_id}/`}
                  target="_blank"
                  rel="noopener"
                  class="text-base"
                  aria-label="Összes szín megtekintése"
                >
                  <Icon icon="mdi:information-outline" class="block" />
                </IconButton>
              </Tooltip>
            {/if}
          </span>
          <span class="text-xs">
            {#if colorCount === undefined}
              <span class="text-red-600">Válaszz először opciót</span>
            {:else}
              {`${field.value.colors.length} / ${colorCount}`}
            {/if}
          </span>
        </p>
        {#if multiColor}
          <div class="mt-1 flex gap-1 flex-wrap">
            {#each field.value.colors as colorId, index (index)}
              {@const colorInfo = materialInfo.colors?.find((c) => c.color_id === colorId)}
              {#if colorInfo}
                <Chip
                  color={colorInfo.hex}
                  bgImage={colorInfo.image?.src}
                  onClose={() => removeColor(index)}
                >
                  {colorInfo.label || colorInfo.color_id}
                </Chip>
              {/if}
            {/each}
          </div>
        {/if}
        {#if (materialInfo.colors?.length ?? 0) > 0}
          {@const disabled =
            colorCount === undefined ||
            (multiColor ? field.value.colors.length >= colorCount : false)}
          <div transition:slide class="mt-1 flex gap-1 flex-wrap leading-0">
            {#each materialInfo.colors || [] as color (color.color_id)}
              {@const selected = field.value?.colors.includes(color.color_id)}
              <Color {color} {disabled} selected={!multiColor && !!selected} onclick={addColor} />
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}
