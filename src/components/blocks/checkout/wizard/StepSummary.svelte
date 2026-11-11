<script lang="ts">
  import Icon from "@iconify/svelte";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import type { i18n as I18n } from "i18next";
  import type { Locale } from "@/lib/i18n";

  interface Props {
    locale: Locale;
    title: string;
    summary: string;
    onEdit: () => void;
  }

  let { locale, title, summary, onEdit }: Props = $props();
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    <div class="flex items-center gap-3 rounded-xl bg-brown-100 px-4 py-3">
      <span
        class="flex size-7 shrink-0 items-center justify-center rounded-full bg-brown-500 text-white"
      >
        <Icon icon="mdi:check" class="text-base" />
      </span>
      <div class="flex min-w-0 flex-1 items-baseline gap-2 text-sm">
        <span class="shrink-0 font-bold text-headings">{title}</span>
        {#if summary !== ""}
          <span class="min-w-0 truncate text-body" title={summary}>{summary}</span>
        {/if}
      </div>
      <button
        type="button"
        onclick={onEdit}
        class="shrink-0 cursor-pointer text-sm text-accent underline underline-offset-2 transition-colors hover:text-brown-700"
      >
        {i18n.t("checkout.modify")}
      </button>
    </div>
  {/snippet}
</I18nGate>
