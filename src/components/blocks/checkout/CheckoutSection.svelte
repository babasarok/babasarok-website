<script lang="ts">
  import CheckoutWizard from "@/components/blocks/checkout/CheckoutWizard.svelte";
  import CatalogState from "@/components/blocks/catalog/CatalogState.svelte";
  import { toCheckoutCatalog } from "@/lib/catalog/checkoutCatalog";
  import { remoteValue } from "@/lib/catalog/remote.svelte";
  import type { Catalog } from "@/lib/catalog";
  import { catalogStore } from "@/lib/catalog/store";
  import type { Locale } from "@/lib/i18n";

  interface Props {
    locale: Locale;
    supportEmail: string | null | undefined;
    basketInfo?: string | undefined;
  }

  let { locale, ...content }: Props = $props();

  const catalog = remoteValue(() => catalogStore.catalog(locale));
</script>

<CatalogState {locale} remote={catalog.current} retry={catalog.retry}>
  {#snippet skeleton()}
    <div class="grid animate-pulse grid-cols-1 gap-8 lg:grid-cols-2">
      <div class="bg-brown-100 h-96 rounded-[20px]"></div>
      <div class="bg-brown-100 h-96 rounded-[20px]"></div>
    </div>
  {/snippet}

  {#snippet children(loaded: Catalog)}
    {@const checkout = toCheckoutCatalog(loaded)}
    <CheckoutWizard
      {locale}
      labels={checkout.labels}
      setMembers={checkout.setMembers}
      {...content}
    />
  {/snippet}
</CatalogState>
