<script lang="ts">
  import Icon from "@iconify/svelte";
  import { marked } from "marked";
  import type { CmsDeliveryMethod } from "@/lib/data";

  interface Props {
    deliveryMethods: Record<string, CmsDeliveryMethod> | null;
    deliveryMethod: string;
  }

  let { deliveryMethods, deliveryMethod = $bindable() }: Props = $props();
</script>

<div class="flex flex-1 flex-col rounded-xl bg-border p-4">
  <div class="flex items-center gap-2">
    <Icon icon="mdi:truck-delivery" class="shrink-0 text-2xl  text-primary-500" />
    <h4 class="text-lg uppercase">Hogyan szeretnéd megkapni a csomagot?</h4>
  </div>
  <div class="flex flex-col gap-2 mt-4">
    {#each Object.values(deliveryMethods || {}) as method (method.delivery_name)}
      <label class="flex items-center gap-2">
        <input
          class="w-auto"
          type="radio"
          name="deliveryMethod"
          value={method.delivery_name}
          bind:group={deliveryMethod}
        />
        <div class="flex flex-col">
          <!-- eslint-disable-next-line svelte/no-at-html-tags -->
          <span class="text-sm">{@html marked(method.name)}</span>
          <span class="text-xs text-foreground">{method.price} Ft</span>
        </div>
      </label>
    {/each}
  </div>
</div>
