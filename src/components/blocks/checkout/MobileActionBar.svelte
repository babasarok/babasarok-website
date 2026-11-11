<script lang="ts">
  import Icon from "@iconify/svelte";
  import Button from "@/components/ui/Button.svelte";
  import type { i18n as I18n } from "i18next";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import type { Locale } from "@/lib/i18n";

  interface Props {
    locale: Locale;
    backVisible: boolean;
    onBack: () => void;
    nextLabel: string;
    nextDisabled: boolean;
    pending: boolean;
    formId: string;
  }

  let { locale, backVisible, onBack, nextLabel, nextDisabled, pending, formId }: Props = $props();
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    <div
      class="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-2 border-t border-brown-200 bg-white px-3 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] shadow-[0_-8px_24px_rgba(52,58,64,0.15)] lg:hidden"
    >
      {#if backVisible}
        <Button
          type="button"
          variant="outlined"
          class="h-11 shrink-0 px-3"
          onclick={onBack}
          data-testid="wizard-back"
        >
          {i18n.t("checkout.back")}
        </Button>
      {/if}

      <Button
        type="submit"
        form={formId}
        variant="contained"
        class="ml-auto flex h-11 shrink-0 items-center gap-2 px-4 uppercase"
        disabled={nextDisabled || pending}
        aria-busy={pending}
        data-testid="wizard-next"
      >
        {#if pending}
          <Icon icon="mdi:loading" class="animate-spin text-lg" />
        {/if}
        {nextLabel}
      </Button>
    </div>
  {/snippet}
</I18nGate>
