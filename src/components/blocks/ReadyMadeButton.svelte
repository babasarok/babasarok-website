<script lang="ts">
  import Button from "@/components/ui/Button.svelte";
  import { remoteValue } from "@/lib/catalog/remote.svelte";
  import { catalogStore } from "@/lib/catalog/store";
  import { localizedPath, type Locale } from "@/lib/i18n";
  import { backOut } from "svelte/easing";
  import type { TransitionConfig } from "svelte/transition";

  interface Props {
    locale: Locale;
    label: string | null | undefined;
  }

  let { locale, label }: Props = $props();

  const catalog = remoteValue(() => catalogStore.catalog(locale));

  const hasReadyMade = $derived(
    catalog.current.status === "ready" &&
      catalog.current.value.products.some((product) => product.ordering.kind === "ready-made")
  );

  function popIn(node: Element, { duration = 300 }: { duration?: number } = {}): TransitionConfig {
    return {
      duration,
      easing: backOut,
      css: (t: number, u: number) => `opacity: ${t}; transform: scale(${1 - 0.2 * u});`,
    };
  }
</script>

{#if hasReadyMade && label}
  <div transition:popIn>
    <Button
      href={`${localizedPath("/product/", locale)}?ready-made=1`}
      variant="outline-secondary"
      size="lg"
    >
      {label}
    </Button>
  </div>
{/if}
