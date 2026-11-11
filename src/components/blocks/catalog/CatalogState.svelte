<script lang="ts" generics="T">
  import type { Snippet } from "svelte";
  import type { i18n as I18n } from "i18next";
  import Button from "@/components/ui/Button.svelte";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import type { Remote } from "@/lib/catalog/store";
  import type { Locale } from "@/lib/i18n";

  interface Props {
    locale: Locale;
    remote: Remote<T>;
    retry: () => void;
    skeleton: Snippet;
    children: Snippet<[T]>;
  }

  let { locale, remote, retry, skeleton, children }: Props = $props();
</script>

{#if remote.status === "ready"}
  {@render children(remote.value)}
{:else if remote.status === "failed"}
  <I18nGate {locale}>
    {#snippet children(i18n: I18n)}
      <div role="alert" class="flex flex-col items-center gap-4 py-12 text-center">
        <p>{i18n.t("catalog.loadFailed")}</p>
        <Button variant="contained" onclick={retry}>{i18n.t("catalog.retry")}</Button>
      </div>
    {/snippet}
  </I18nGate>
{:else}
  <div aria-busy="true">
    {@render skeleton()}
  </div>
{/if}
