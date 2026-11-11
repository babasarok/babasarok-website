<script lang="ts">
  import Icon from "@iconify/svelte";
  import SetSiblingCard from "./SetSiblingCard.svelte";
  import type { i18n as I18n } from "i18next";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import { localizedPath, type Locale } from "@/lib/i18n";
  import { productPath } from "@/lib/order/queryParams";
  import type { OrderProduct } from "@/lib/order/types";

  interface Props {
    locale: Locale;
    setTitle: string;
    relatedProducts: OrderProduct[];
    basketCountByProductId?: Record<string, number>;
    slugByProductId?: Record<string, string | undefined>;
    /** The current item's materials, preselected on the sibling page the card links to. */
    materialParams: URLSearchParams;
    ready: boolean;
    onAddRelated: (target: OrderProduct) => void;
  }

  let {
    locale,
    setTitle,
    relatedProducts,
    basketCountByProductId = {},
    slugByProductId = {},
    materialParams,
    ready,
    onAddRelated,
  }: Props = $props();
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    <section class="flex flex-col gap-3 rounded-2xl border border-brown-200 bg-brown-50 p-4">
      <div class="flex items-start gap-2">
        <Icon icon="mdi:tag-multiple-outline" class="mt-0.5 shrink-0 text-xl text-brown-500" />
        <div class="flex flex-col gap-0.5">
          <div class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-semibold uppercase tracking-wide text-brown-500">
              {i18n.t("set.suffix", { title: setTitle })}
            </span>
          </div>
          <p class="text-sm text-brown-600">
            {i18n.t("set.hint")}
          </p>
        </div>
      </div>

      <div class="flex flex-wrap gap-3">
        {#each relatedProducts as related (related.product_id)}
          {@const slug = slugByProductId[related.product_id]}
          <SetSiblingCard
            {locale}
            product={related}
            href={slug ? localizedPath(productPath(slug, materialParams), locale) : undefined}
            added={basketCountByProductId[related.product_id] ?? 0}
            disabled={!ready}
            onAdd={() => onAddRelated(related)}
          />
        {/each}
      </div>

      {#if !ready}
        <p class="flex items-start gap-1 text-xs text-brown-500">
          <Icon icon="mdi:information-outline" class="mt-0.5 shrink-0" />
          {i18n.t("set.notReady")}
        </p>
      {/if}
    </section>
  {/snippet}
</I18nGate>
