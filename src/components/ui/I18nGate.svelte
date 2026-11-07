<script lang="ts">
  import type { Snippet } from "svelte";
  import type { i18n as I18n } from "i18next";
  import type { i18n as I18n } from "i18next";
  import type { Locale } from "@/lib/i18n";
  import { getClientI18n } from "@/lib/i18next-client";

  interface Props {
    locale: Locale;
    children: Snippet<[I18n]>;
  }

  let { locale, children }: Props = $props();

  const ready = getClientI18n(locale);
</script>

{#await ready then i18n}
  {@render children(i18n)}
{/await}
