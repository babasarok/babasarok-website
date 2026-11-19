<script lang="ts">
  import Button from "@/components/ui/ActionButton.svelte";
  import {
    isOptionAvailable,
    type ReadyMadeOrdering,
    type ReadyMadeVariant,
  } from "@/lib/catalog/readyMade";
  import type { i18n as I18n } from "i18next";

  interface Props {
    i18n: I18n;
    ordering: ReadyMadeOrdering;
    selected: ReadyMadeVariant;
    onPick: (optionId: string) => void;
  }

  let { i18n, ordering, selected, onPick }: Props = $props();
</script>

<div class="flex flex-col gap-3">
  {#each ordering.optionGroups as group (group.id)}
    <fieldset class="flex flex-col gap-1">
      <legend class="mb-1 text-sm text-brown-500">{group.name}</legend>
      <div class="flex flex-wrap gap-1">
        {#each group.options as option (option.id)}
          {@const available = isOptionAvailable(ordering, option.id)}
          <Button
            type="button"
            class={[!available && "line-through"]}
            selected={selected.optionIds.includes(option.id)}
            aria-pressed={selected.optionIds.includes(option.id)}
            disabled={!available}
            onclick={() => onPick(option.id)}
          >
            {option.name}
            {#if !available}
              <span class="sr-only">({i18n.t("readyMade.soldOut")})</span>
            {/if}
          </Button>
        {/each}
      </div>
    </fieldset>
  {/each}
</div>
