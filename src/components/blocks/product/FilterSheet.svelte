<script lang="ts">
  import type { i18n as I18n } from "i18next";
  import type { Locale } from "@/lib/i18n";
  import type { ProductType } from "../../../lib/product/productTypes";
  import FilterGroups from "./FilterGroups.svelte";
  import Sheet from "../../ui/Sheet.svelte";

  interface SetOption {
    id: string;
    title: string;
  }

  interface Props {
    i18n: I18n;
    locale: Locale;
    sets: SetOption[];
    selectedTypes: ProductType[];
    selectedSets: string[];
    onToggleType: (value: ProductType) => void;
    onToggleSet: (id: string) => void;
    onClear: () => void;
  }

  let {
    i18n,
    locale,
    sets,
    selectedTypes,
    selectedSets,
    onToggleType,
    onToggleSet,
    onClear,
  }: Props = $props();

  const activeFilterCount = $derived(selectedTypes.length + selectedSets.length);

  let open = $state(false);
</script>

<button
  type="button"
  onclick={() => (open = true)}
  class="text-body relative shrink-0 rounded-full border border-muted bg-light px-4 py-2.5 text-sm"
>
  {i18n.t("filters.title")}
  {#if activeFilterCount > 0}
    <span
      class="bg-accent text-light absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full text-xs"
    >
      {activeFilterCount}
    </span>
  {/if}
</button>

{#snippet sheetContent()}
  <div class="text-headings mb-6 text-h5">{i18n.t("filters.title")}</div>
  <FilterGroups
    {i18n}
    {locale}
    {sets}
    {selectedTypes}
    {selectedSets}
    {onToggleType}
    {onToggleSet}
  />
  <div class="mt-8 flex items-center justify-between gap-4">
    {#if activeFilterCount > 0}
      <button type="button" onclick={onClear} class="text-accent text-sm hover:underline">
        {i18n.t("filters.clear")}
      </button>
    {:else}
      <span aria-hidden="true"></span>
    {/if}
    <button
      type="button"
      onclick={() => (open = false)}
      class="bg-accent text-light rounded-full px-6 py-2.5 text-sm transition-colors hover:bg-sand-700"
    >
      {i18n.t("filters.done")}
    </button>
  </div>
{/snippet}

<Sheet
  {open}
  aria-label={i18n.t("filters.title")}
  content={sheetContent}
  onOpenChange={(value) => (open = value)}
/>
