<script lang="ts">
  import type { i18n as I18n } from "i18next";
  import {
    PRODUCT_TYPES,
    productTypeLabel,
    type ProductType,
  } from "../../../lib/product/productTypes";
  import type { Locale } from "@/lib/i18n";

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
  }

  let { i18n, locale, sets, selectedTypes, selectedSets, onToggleType, onToggleSet }: Props =
    $props();
</script>

<fieldset>
  <legend class="text-headings mb-2.5 text-h5 mt-3">{i18n.t("filters.type")}</legend>
  <div class="flex flex-col gap-1.5">
    {#each PRODUCT_TYPES as type (type.value)}
      <label class="text-body flex cursor-pointer items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          value={type.value}
          checked={selectedTypes.includes(type.value)}
          onchange={() => onToggleType(type.value)}
          class="size-4 accent-accent"
        />
        {productTypeLabel(type.value, locale)}
      </label>
    {/each}
  </div>
</fieldset>
<fieldset class="mt-8">
  <legend class="text-headings mb-2.5 text-h5">{i18n.t("filters.sets")}</legend>
  <div class="flex flex-col gap-1.5">
    {#each sets as set (set.id)}
      <label class="text-body flex cursor-pointer items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          value={set.id}
          checked={selectedSets.includes(set.id)}
          onchange={() => onToggleSet(set.id)}
          class="size-4 accent-accent"
        />
        {set.title}
      </label>
    {/each}
  </div>
</fieldset>
