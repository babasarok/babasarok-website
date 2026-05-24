<script lang="ts">
    import Icon from "@iconify/svelte";
    import { marked } from "marked";
    import type { TinaDeliveryMethodResolved } from "../lib/types.svelte";

    interface Props {
        deliveryMethods: Record<string, TinaDeliveryMethodResolved> | null;
        deliveryMethod: string;
    }

    let { deliveryMethods, deliveryMethod = $bindable() }: Props = $props();
</script>

<div class="flex flex-col rounded-xl bg-border p-4 w-full md:w-1/2">
    <div class="flex items-center gap-2">
        <Icon icon="mdi:truck-delivery" class="shrink-0 text-2xl  text-primary-500" />
        <h4 class="text-xl text-uppercase">Szállítási mód</h4>
    </div>
    <div class="flex flex-col gap-2 mt-4">
        {#each Object.values(deliveryMethods || {}) as method}
            <label class="flex items-center gap-2">
                <input
                    class="w-auto"
                    type="radio"
                    name="deliveryMethod"
                    value={method.delivery_name}
                    bind:group={deliveryMethod} />
                <div class="flex flex-col">
                    <span class="text-sm">{@html marked(method.name)}</span>
                    <span class="text-xs text-foreground">{method.price} Ft</span>
                </div>
            </label>
        {/each}
    </div>
</div>
