<script lang="ts">
  import Icon from "@iconify/svelte";
  import { formatMoney } from "@/lib/basket/money";
  import type { Order } from "@/lib/basket/schemas";
  import { setSection } from "@/lib/basket/setDiscounts";
  import type { i18n as I18n } from "i18next";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import type { Locale } from "@/lib/i18n";

  interface Props {
    locale: Locale;
    order: Order;
    /** Highlight the given basket lines (a set instance's members) in the line list. */
    onHighlight?: (lineIds: string[]) => void;
  }

  let { locale, order, onHighlight }: Props = $props();

  const sets = $derived(setSection(order));
  const deals = $derived(order.discounts.filter((discount) => discount.amountWithTax !== 0));

  // Hovering or focusing a set card highlights its member lines in the line
  // list; a clicked card pins the highlight so it survives the pointer
  // leaving (the card has no other action).
  let pinned = $state<number | undefined>();

  function memberLineIds(index: number): string[] {
    return sets[index]?.members.map((member) => member.lineId) ?? [];
  }

  function highlight(index: number): void {
    onHighlight?.(memberLineIds(index));
  }

  function leave(): void {
    onHighlight?.(pinned === undefined ? [] : memberLineIds(pinned));
  }

  function togglePin(index: number): void {
    pinned = pinned === index ? undefined : index;
    onHighlight?.(pinned === undefined ? [] : memberLineIds(index));
  }
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    {#if sets.length > 0}
      <section class="flex flex-col gap-2 rounded-2xl border border-success-600 bg-success-50 p-4">
        <h2 class="text-sm font-semibold uppercase tracking-wide text-success-800">
          {i18n.t("set.discounts")}
        </h2>
        <ul class="flex flex-col gap-2 text-sm text-success-800">
          {#each sets as set, i (`${set.groupId}:${i}`)}
            <li data-testid="set-discount">
              <button
                type="button"
                class="w-full cursor-pointer rounded-lg p-1 text-left transition-colors hover:bg-success-100"
                onclick={() => togglePin(i)}
                onmouseenter={() => highlight(i)}
                onmouseleave={leave}
                onfocus={() => highlight(i)}
                onblur={leave}
              >
                <div class="flex justify-between gap-4">
                  <span class="font-medium">{set.title}</span>
                  <span>{formatMoney(set.amount, order.currencyCode)}</span>
                </div>
                <ul class="text-xs">
                  {#each set.members as member, j (`${member.lineId}:${j}`)}
                    <li>{member.name} · {member.units} db</li>
                  {/each}
                </ul>
              </button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if deals.length > 0}
      <section class="flex flex-col gap-2 rounded-2xl border border-success-600 bg-success-50 p-4">
        <div class="flex items-center gap-2">
          <Icon icon="mdi:tag-multiple-outline" class="shrink-0 text-xl text-success-700" />
          <h2 class="text-sm font-semibold uppercase tracking-wide text-success-800">
            Kedvezmények
          </h2>
        </div>
        <ul class="flex flex-col gap-1 text-sm text-success-800">
          {#each deals as deal, i (`${deal.description}:${i}`)}
            <li class="flex justify-between gap-4">
              <span>{deal.description}</span>
              <span class="font-medium">{formatMoney(deal.amountWithTax, order.currencyCode)}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {/snippet}
</I18nGate>
