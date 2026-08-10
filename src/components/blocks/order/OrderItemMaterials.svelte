<script lang="ts">
  import Button from "./common/Button.svelte";
  import Chip from "./common/Chip.svelte";
  import Icon from "@iconify/svelte";
  import Color from "./common/Color.svelte";
  import IconButton from "./common/IconButton.svelte";
  import Tooltip from "./common/Tooltip.svelte";
  import TextInput from "./common/TextInput.svelte";
  import { slide } from "svelte/transition";
  import type { IProduct } from "@/lib/types.svelte";
  import { resolveColorCount } from "@/lib/materialUtils";
  import type { ProductMaterialValue } from "@/lib/types.svelte";

  interface Props {
    product: IProduct;
    material_index?: number;
    onChange?: ((product: IProduct) => void) | undefined;
  }

  const { product, onChange, material_index = 0 }: Props = $props();

  /**
   * Returns true if selected materials satisfy required materials using count-aware matching.
   *
   * This treats material lists as multisets, not sets, so repeated entries are respected.
   * Example: required [A, A] is only satisfied when selected contains at least two A values.
   */
  const hasRequiredCounts = (
    requiredMaterialIds: string[],
    selectedCounts: Map<string, number>
  ): boolean => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const requiredCounts = new Map<string, number>();
    for (const materialId of requiredMaterialIds) {
      requiredCounts.set(materialId, (requiredCounts.get(materialId) ?? 0) + 1);
    }

    for (const [materialId, requiredCount] of requiredCounts) {
      if ((selectedCounts.get(materialId) ?? 0) < requiredCount) {
        return false;
      }
    }

    return true;
  };

  /**
   * Material IDs that must be disabled in the current slot.
   *
   * Rules:
   * - Banned combinations come from product.materials.banned_combinations.
   * - Paths are resolved to material IDs before matching.
   * - Only selections in other slots are considered.
   * - A candidate is disabled only if choosing it now would complete a banned combination.
   * - Single-item combinations are ignored here.
   */
  const bannedMaterials = $derived.by(() => {
    const selectedInOtherSlots = product.materials.values
      .filter((value, index) => index !== material_index && !!value?.material_id)
      .map((value) => value?.material_id)
      .filter((materialId): materialId is string => !!materialId);

    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const selectedCounts = new Map<string, number>();
    for (const materialId of selectedInOtherSlots) {
      selectedCounts.set(materialId, (selectedCounts.get(materialId) ?? 0) + 1);
    }

    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const banned = new Set<string>();
    for (const combination of product.materials.banned_combinations ?? []) {
      const combinationMaterialIds =
        combination?.materials
          ?.map((item) => item?.material_path?.material_id)
          .filter((materialId): materialId is string => !!materialId) ?? [];

      if (combinationMaterialIds.length <= 1) {
        continue;
      }

      for (const [index, candidateId] of combinationMaterialIds.entries()) {
        const requiredOtherIds = [
          ...combinationMaterialIds.slice(0, index),
          ...combinationMaterialIds.slice(index + 1),
        ];
        if (hasRequiredCounts(requiredOtherIds, selectedCounts)) {
          banned.add(candidateId);
        }
      }
    }

    return [...banned];
  });
</script>

{#if product.materials.materials.length > 0}
  <div class="flex flex-col gap-1">
    <p class="text-sm text-brown-500">
      {product.materials.material_required_count == 1 ? "Anyag" : `Anyag ${material_index + 1}`}
    </p>
    <div class="flex gap-1 flex-wrap">
      {#each product.materials.materials.filter((x) => x != null) as material (material.material_path.material_id)}
        {@const materialInfo = material.material_path}
        {@const disabled = bannedMaterials.includes(materialInfo.material_id)}
        {#if materialInfo}
          {@const selected =
            product.materials.values[material_index]?.material_id === materialInfo.material_id}
          <Button
            type="button"
            class="flex items-center gap-0.5"
            {selected}
            disabled={disabled && !selected}
            onclick={() => {
              const result = product;
              result.materials.values = result.materials.values;
              result.materials.values[material_index] = {
                material_id: materialInfo.material_id,
                colors: [],
              };
              onChange?.(result);
            }}
          >
            {materialInfo.label || materialInfo.material_id}
          </Button>
        {/if}
      {/each}
    </div>
  </div>
  {#if product.materials.values[material_index] && !!product.materials.values[material_index].material_id}
    {@const value = product.materials.values[material_index] as ProductMaterialValue | undefined}
    {@const productMaterial = product.materials.materials.find(
      (m) => !!m && m.material_path.material_id === value?.material_id
    )}
    {@const materialInfo = productMaterial?.material_path}
    {@const custom = value?.custom_color != undefined || (materialInfo?.colors?.length ?? 0) === 0}
    {@const colorCount = resolveColorCount(productMaterial ?? null, product)}
    {@const multiColor = (colorCount ?? 0) > 1}
    {@const disabled =
      colorCount === undefined || (multiColor ? (value?.colors.length ?? 0) >= colorCount : false)}
    <div class="flex flex-col gap-2" transition:slide>
      <div class="flex flex-col">
        <p class="text-sm text-brown-500 flex items-center gap-1 justify-between">
          <span class="flex items-center gap-1">
            Szín
            {#if materialInfo?.material_id && (materialInfo.colors?.length ?? 0) > 0}
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
            {#if custom}
              Egyedi szín
            {:else if colorCount === undefined}
              <span class="text-red-600">Válaszz először opciót</span>
            {:else}
              {`${value?.colors.length ?? 0} / ${colorCount}`}
            {/if}
          </span>
        </p>
        {#if multiColor}
          <div class="mt-1 flex gap-1 flex-wrap">
            {#each value?.colors as colorId, index (colorId)}
              {@const colorInfo = materialInfo?.colors?.find((c) => c.color_id === colorId)}
              {#if colorInfo}
                <Chip
                  color={colorInfo.hex}
                  bgImage={colorInfo.image?.src}
                  onClose={() => {
                    const result = product;
                    if (result.materials.values[material_index]) {
                      result.materials.values[material_index].colors = [
                        ...result.materials.values[material_index].colors.slice(0, index),
                        ...result.materials.values[material_index].colors.slice(index + 1),
                      ];
                    }
                    onChange?.(result);
                  }}
                >
                  {colorInfo.label || colorInfo.color_id}
                </Chip>
              {/if}
            {/each}
          </div>
        {/if}
        {#if (materialInfo?.colors?.length ?? 0) > 0}
          <div transition:slide class="mt-1 flex gap-1 flex-wrap leading-0">
            {#each materialInfo?.colors || [] as color (color.color_id)}
              {@const selected = value?.colors.includes(color.color_id)}
              <Color
                {color}
                {disabled}
                selected={!multiColor && !!selected}
                onclick={() => {
                  const result = product;
                  if (!result.materials.values[material_index]) {
                    return;
                  }

                  if (multiColor) {
                    result.materials.values[material_index].colors.push(color.color_id);
                  } else {
                    result.materials.values[material_index].colors = [color.color_id];
                  }
                  result.materials.values[material_index].custom_color = undefined;
                  onChange?.(result);
                }}
              />
            {/each}
          </div>
        {/if}
      </div>
      {#if (materialInfo?.colors?.length ?? 0) > 0}
        <Button
          {disabled}
          type="button"
          onclick={() => {
            const result = product;
            if (!result.materials.values[material_index]) {
              return;
            }
            result.materials.values[material_index].colors = [];
            result.materials.values[material_index].custom_color = "";
            onChange?.(result);
          }}
        >
          Egyéb
        </Button>
      {/if}
      {#if custom}
        <TextInput
          value={value?.custom_color}
          oninput={(e) => {
            const result = product;
            if (!result.materials.values[material_index]) {
              return;
            }
            result.materials.values[material_index].custom_color = (
              e.target as HTMLInputElement
            ).value;
            onChange?.(result);
          }}
        />
      {/if}
    </div>
  {/if}
  {#if product.materials.values[material_index]?.error}
    <p class="text-sm text-red-500">
      {product.materials.values[material_index].error}
    </p>
  {/if}
{/if}
