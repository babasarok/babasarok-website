<script lang="ts">
    import type { Product } from "../products";
    import racsvedo from "../../data/products/racsvedo.json";
    import Icon from "@iconify/svelte";

    interface Props {
        onClose: () => void;
        product: Product;
    }

    let { onClose, product }: Props = $props();

    let productInfo: typeof racsvedo | null = $state(null);

    async function main() {
        productInfo = await import(`../../data/products/${product.id}.json`);
    }

    main();
</script>

<div class="flex flex-col gap-2 rounded-lg border shadow-md border-primary-light p-2">
    <div class="flex justify-between items-center">
        <div class="flex items-center gap-2">
            <Icon icon="mdi:circle" class="text-primary-light text-4xl" />
            <p>{productInfo?.name}</p>
        </div>
        <button onclick={onClose}>
            <Icon icon="mdi:close" class="text-2xl" />
        </button>
    </div>
</div>
