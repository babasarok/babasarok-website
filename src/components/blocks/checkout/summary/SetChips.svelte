<script lang="ts">
  import Icon from "@iconify/svelte";
  import { formatMoney } from "@/lib/basket/money";
  import type { Order } from "@/lib/basket/schemas";
  import type { i18n as I18n } from "i18next";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import type { Locale } from "@/lib/i18n";

  interface SetChip {
    groupId: string;
    title: string;
    instances: number;
    amount: number;
    lineIds: string[];
  }

  interface Props {
    locale: Locale;
    order: Order;
    onHighlight: (lineIds: readonly string[]) => void;
  }

  let { locale, order, onHighlight }: Props = $props();

  function chipsFromInstances(): SetChip[] {
    const chips: SetChip[] = [];

    for (const entry of order.setDiscounts ?? []) {
      let chip = chips.find((candidate) => candidate.groupId === entry.groupId);

      if (chip === undefined) {
        chip = { groupId: entry.groupId, title: entry.title, instances: 0, amount: 0, lineIds: [] };
        chips.push(chip);
      }

      chip.instances += 1;
      chip.amount += entry.amount;

      for (const member of entry.lines) {
        if (!chip.lineIds.includes(member.orderLineId)) {
          chip.lineIds.push(member.orderLineId);
        }
      }
    }

    return chips;
  }

  function chipsFromPendingLines(formed: SetChip[]): SetChip[] {
    const chips: SetChip[] = [];

    for (const line of order.lines) {
      const state = line.setState;

      if (state === null || state === undefined || state.kind === "ACTIVE") {
        continue;
      }

      if (formed.some((chip) => chip.groupId === state.groupId)) {
        continue;
      }

      let chip = chips.find((candidate) => candidate.groupId === state.groupId);

      if (chip === undefined) {
        chip = { groupId: state.groupId, title: state.title, instances: 0, amount: 0, lineIds: [] };
        chips.push(chip);
      }

      if (!chip.lineIds.includes(line.id)) {
        chip.lineIds.push(line.id);
      }
    }

    return chips;
  }

  const formed = $derived(chipsFromInstances());
  const chips = $derived([...formed, ...chipsFromPendingLines(formed)]);

  let pinned = $state<string | undefined>();

  function highlight(chip: SetChip): void {
    onHighlight(chip.lineIds);
  }

  function leave(): void {
    const pinnedChip = chips.find((candidate) => candidate.groupId === pinned);

    onHighlight(pinnedChip?.lineIds ?? []);
  }

  function togglePin(chip: SetChip): void {
    pinned = pinned === chip.groupId ? undefined : chip.groupId;

    if (pinned === undefined) {
      onHighlight([]);
      return;
    }

    onHighlight(chip.lineIds);
  }
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    {#if chips.length > 0}
      <div class="flex flex-wrap gap-2">
        {#each chips as chip (chip.groupId)}
          <button
            type="button"
            data-testid="set-discount"
            aria-pressed={pinned === chip.groupId}
            class={[
              "flex max-w-full cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors",
              chip.instances === 0
                ? "bg-muted text-brown-400"
                : "bg-sand-100 text-brown-700 hover:bg-sand-300/50",
            ]}
            onmouseenter={() => highlight(chip)}
            onmouseleave={leave}
            onfocus={() => highlight(chip)}
            onblur={leave}
            onclick={() => togglePin(chip)}
          >
            <Icon icon="mdi:tag" class="shrink-0 text-base" />
            <span class="text-left leading-snug">
              {chip.title}
              {#if chip.instances === 0}
                · {i18n.t("checkout.setIncomplete")}
              {:else}
                · {i18n.t("checkout.setInstances", { count: chip.instances })}
                · −{formatMoney(chip.amount, order.currencyCode)}
              {/if}
            </span>
          </button>
        {/each}
      </div>
    {/if}
  {/snippet}
</I18nGate>
