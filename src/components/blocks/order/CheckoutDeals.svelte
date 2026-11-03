<script lang="ts">
  import Icon from "@iconify/svelte";
  import { formatMoney } from "@/lib/basket/money";
  import type { Order } from "@/lib/basket/schemas";

  interface Props {
    order: Order;
  }

  let { order }: Props = $props();

  const deals = $derived(order.discounts.filter((discount) => discount.amountWithTax !== 0));
</script>

{#if deals.length > 0}
  <section class="flex flex-col gap-2 rounded-2xl border border-success-600 bg-success-50 p-4">
    <div class="flex items-center gap-2">
      <Icon icon="mdi:tag-multiple-outline" class="shrink-0 text-xl text-success-700" />
      <h2 class="text-sm font-semibold uppercase tracking-wide text-success-800">Kedvezmények</h2>
    </div>
    <ul class="flex flex-col gap-1 text-sm text-success-800">
      {#each deals as deal (deal.description)}
        <li class="flex justify-between gap-4">
          <span>{deal.description}</span>
          <span class="font-medium">{formatMoney(deal.amountWithTax, order.currencyCode)}</span>
        </li>
      {/each}
    </ul>
  </section>
{/if}
