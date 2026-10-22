<script lang="ts">
  import Icon from "@iconify/svelte";
  import Dialog from "@/components/ui/Dialog.svelte";
  import Toggle from "@/components/ui/Toggle.svelte";
  import type { CookieCategory } from "@/lib/cookie";
  import {
    CONSENT_RESET_EVENT,
    META_PIXEL_ID,
    loadGtmContainer,
    loadMetaPixel,
    needsReload,
    readConsent,
    saveConsent,
    type Choice,
  } from "@/lib/tracking";
  import { SvelteSet } from "svelte/reactivity";
  import { onMount } from "svelte";

  let {
    gtmId,
    heading,
    text,
    categories,
  }: {
    gtmId: string;
    heading: string;
    text: string;
    categories: CookieCategory[];
  } = $props();

  let open = $state(false);
  let view = $state<"settings" | "confirmation">("settings");
  let analytics = $state(true);
  let marketing = $state(true);
  let expandedKey = new SvelteSet<string>();

  const ICONS: Record<CookieCategory["key"], string> = {
    necessary: "mdi:shield-check",
    analytics: "mdi:chart-box",
    marketing: "mdi:target",
  };

  function loadTrackers(consent: Choice): void {
    if (consent.analytics || consent.marketing) {
      loadGtmContainer(gtmId, consent);
    }
    if (consent.marketing) {
      loadMetaPixel(META_PIXEL_ID);
    }
  }

  function apply(next: Choice): boolean {
    const previous = readConsent();
    saveConsent(next);
    if (needsReload(previous, next)) {
      globalThis.location.reload();
      return true;
    }
    loadTrackers(next);
    return false;
  }

  function acceptAll(): void {
    open = false;
    apply({ analytics: true, marketing: true });
  }

  function rejectAll(close: () => void): void {
    const reloaded = apply({ analytics: false, marketing: false });
    if (!reloaded) {
      close();
    }
    open = false;
  }

  function saveSettings(): void {
    const reloaded = apply({ analytics, marketing });
    if (!reloaded) {
      view = "confirmation";
    }
  }

  function syncToggles(): void {
    const consent = readConsent();
    analytics = consent ? consent.analytics : false;
    marketing = consent ? consent.marketing : false;
  }

  function toggleDetails(key: string): void {
    console.log(key, expandedKey, expandedKey.has(key));
    if (expandedKey.has(key)) {
      expandedKey.delete(key);
    } else {
      expandedKey.add(key);
    }
  }

  function onDialogClose(): void {
    if (view === "confirmation") {
      open = false;
    }
    syncToggles();
    view = "settings";
    expandedKey.clear();
  }

  onMount(() => {
    const consent = readConsent();
    if (consent) {
      analytics = consent.analytics;
      marketing = consent.marketing;
      loadTrackers(consent);
    } else {
      open = true;
    }
    const onReset = (): void => {
      syncToggles();
      open = true;
    };
    globalThis.addEventListener(CONSENT_RESET_EVENT, onReset);
    return () => {
      globalThis.removeEventListener(CONSENT_RESET_EVENT, onReset);
    };
  });
</script>

{#if open}
  <section aria-label="Adatkezelési hozzájárulás" class="fixed inset-x-0 bottom-0 z-50 p-4 sm:p-6">
    <div
      class="mx-auto flex max-w-2xl flex-col gap-3 rounded-2xl border border-brown-200 bg-white p-5 text-sm text-body shadow-[0_20px_40px_0_rgba(50,65,141,0.18)]"
    >
      <h2 class="text-base font-semibold text-headings">{heading}</h2>
      <p class="m-0">{text}</p>
      <div class="mt-1 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onclick={acceptAll}
          class="flex h-11 items-center justify-center rounded-md bg-brown-500 px-4 text-sm font-medium uppercase text-white transition-all hover:bg-brown-700"
        >
          Összes elfogadása
        </button>
        <Dialog aria-label="Cookie beállítások" onClose={onDialogClose}>
          {#snippet button(id)}
            <button
              commandfor={id}
              command="show-modal"
              class="flex h-11 items-center justify-center rounded-md border border-brown-200 bg-white px-4 text-sm font-medium uppercase text-brown-600 transition-all hover:bg-brown-100"
            >
              Beállítások
            </button>
          {/snippet}
          {#snippet content(close)}
            {#if view === "settings"}
              <div class="flex flex-col gap-4">
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h2 class="text-base font-semibold text-headings">Cookie beállítások</h2>
                    <p class="mt-1 mb-0 text-body">
                      Itt szabályozhatja, hogy milyen típusú sütiket szeretne engedélyezni. A
                      beállításokat bármikor módosíthatja.
                    </p>
                  </div>
                  <button
                    type="button"
                    onclick={close}
                    aria-label="Bezárás"
                    class="flex shrink-0 cursor-pointer rounded-full p-1.5 text-brown-500 transition-colors hover:bg-brown-100 hover:text-dark"
                  >
                    <Icon icon="mdi:close" class="text-2xl" />
                  </button>
                </div>

                <ul class="flex flex-col gap-2">
                  {#each categories as category (category.key)}
                    <li class="flex flex-col gap-2 rounded-xl border border-brown-100 p-3">
                      <div class="flex items-center justify-between gap-3">
                        <div class="flex items-start gap-3">
                          <Icon
                            icon={ICONS[category.key]}
                            class="mt-0.5 text-xl text-brown-500 shrink-0"
                          />
                          <div>
                            <h3 class="m-0 font-medium text-headings">{category.label}</h3>
                            <p class="mt-1 mb-0 text-xs text-body">{category.description}</p>
                          </div>
                        </div>
                        <div class="flex shrink-0 items-center gap-3">
                          <button
                            type="button"
                            onclick={() => toggleDetails(category.key)}
                            class="flex items-center gap-1 text-xs text-accent underline"
                          >
                            Részletek
                            <Icon
                              icon={expandedKey.has(category.key)
                                ? "mdi:chevron-up"
                                : "mdi:chevron-down"}
                              class="text-sm"
                            />
                          </button>
                          {#if category.locked}
                            <Toggle checked disabled />
                          {:else if category.key === "analytics"}
                            <Toggle bind:checked={analytics} />
                          {:else if category.key === "marketing"}
                            <Toggle bind:checked={marketing} />
                          {/if}
                        </div>
                      </div>
                      {#if expandedKey.has(category.key)}
                        <table class="w-full border-collapse text-left text-xs">
                          <thead>
                            <tr class="border-b border-brown-100 text-brown-500">
                              <th class="py-1.5 pr-3 font-medium">Név</th>
                              <th class="py-1.5 pr-3 font-medium">Domain</th>
                              <th class="py-1.5 font-medium">Tárolási idő</th>
                            </tr>
                          </thead>
                          <tbody>
                            {#each category.cookies as cookie (cookie.name)}
                              <tr class="border-b border-brown-100 last:border-0">
                                <td class="py-1.5 pr-3 font-medium text-headings">{cookie.name}</td>
                                <td class="py-1.5 pr-3 text-body">{cookie.domain}</td>
                                <td class="py-1.5 text-body">{cookie.lifetime}</td>
                              </tr>
                            {/each}
                          </tbody>
                        </table>
                      {/if}
                    </li>
                  {/each}
                </ul>

                <div class="flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    onclick={() => rejectAll(close)}
                    class="flex h-11 items-center justify-center rounded-md border border-brown-200 bg-white px-4 text-sm font-medium uppercase text-brown-600 transition-all hover:bg-brown-100 cursor-pointer"
                  >
                    Mindent elutasít
                  </button>
                  <button
                    type="button"
                    onclick={saveSettings}
                    class="flex h-11 items-center justify-center rounded-md bg-brown-500 px-4 text-sm font-medium uppercase text-white transition-all hover:bg-brown-700 cursor-pointer"
                  >
                    Beállítások mentése
                  </button>
                </div>
              </div>
            {:else}
              <div class="flex flex-col items-center gap-3 py-4 text-center">
                <div class="flex h-12 w-12 items-center justify-center rounded-full bg-brown-100">
                  <Icon icon="mdi:check" class="text-3xl text-brown-500" />
                </div>
                <h2 class="m-0 text-base font-semibold text-headings">Beállítások mentve</h2>
                <p class="m-0 text-sm text-body">
                  A cookie beállításait sikeresen elmentettük. A módosításokat bármikor
                  visszavonhatja az Adatvédelmi tájékoztatóban.
                </p>
                <button
                  type="button"
                  onclick={close}
                  class="mt-2 flex h-11 items-center justify-center rounded-md bg-brown-500 px-6 text-sm font-medium uppercase text-white transition-all hover:bg-brown-700"
                >
                  Rendben
                </button>
              </div>
            {/if}
          {/snippet}
        </Dialog>
      </div>
    </div>
  </section>
{/if}
