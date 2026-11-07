<script lang="ts">
  import type { i18n as I18n } from "i18next";
  import Icon from "@iconify/svelte";
  import Dialog from "@/components/ui/Dialog.svelte";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import { localizedPath, locales, type Locale } from "@/lib/i18n";

  interface Props {
    pathname: string;
    locale: Locale;
  }

  let { pathname, locale }: Props = $props();
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    <Dialog aria-label={i18n.t("languageDialog.open")}>
      {#snippet button(id)}
        <button
          type="button"
          commandfor={id}
          command="show-modal"
          aria-label={i18n.t("languageDialog.open")}
          class="flex cursor-pointer items-center gap-1 p-2 text-dark transition-colors hover:text-sand-300"
        >
          <Icon icon="mdi:web" class="text-2xl" />
        </button>
      {/snippet}
      {#snippet content(close)}
        <div class="flex items-center justify-between">
          <p class="font-heading text-xl text-dark">{i18n.t("languageDialog.open")}</p>
          <button
            type="button"
            onclick={close}
            aria-label={i18n.t("languageDialog.close")}
            class="flex shrink-0 cursor-pointer rounded-full p-1.5 text-brown-500 transition-colors hover:bg-brown-100 hover:text-dark"
          >
            <Icon icon="mdi:close" class="text-2xl" />
          </button>
        </div>

        <p class="mt-4 text-xs font-medium tracking-widest text-brown-500 uppercase">
          {i18n.t("languageDialog.language")}
        </p>
        <ul class="mt-2">
          {#each locales as candidate (candidate)}
            <li>
              {#if candidate === locale}
                <span
                  aria-current="true"
                  class="flex items-center justify-between rounded-lg bg-sand-50 p-3 font-medium text-dark"
                >
                  {i18n.t(`languageNames.${candidate}`)}
                  <Icon icon="mdi:check" class="text-lg text-accent" />
                </span>
              {:else}
                <a
                  href={localizedPath(pathname, candidate)}
                  hreflang={candidate}
                  class="flex items-center justify-between rounded-lg p-3 text-dark transition-colors hover:bg-sand-50"
                >
                  {i18n.t(`languageNames.${candidate}`)}
                  <Icon icon="mdi:chevron-right" class="text-lg text-brown-500" />
                </a>
              {/if}
            </li>
          {/each}
        </ul>

        <p class="mt-4 text-xs font-medium tracking-widest text-brown-500 uppercase">
          {i18n.t("languageDialog.region")}
        </p>
        <div class="mt-2 flex items-center gap-2 rounded-lg p-3 text-dark">
          <Icon icon="mdi:earth" class="text-lg text-brown-500" />
          {i18n.t("languageDialog.regionValue")}
        </div>
      {/snippet}
    </Dialog>
  {/snippet}
</I18nGate>
