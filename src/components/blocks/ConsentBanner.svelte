<script lang="ts">
  import {
    CONSENT_RESET_EVENT,
    META_PIXEL_ID,
    loadGtmContainer,
    loadMetaPixel,
    readConsent,
    saveConsent,
  } from "@/lib/tracking";
  import { onMount } from "svelte";

  let { gtmId }: { gtmId: string } = $props();

  let open = $state(false);
  let started = $state(false);

  function start(): void {
    if (started) {
      return;
    }
    started = true;
    loadGtmContainer(gtmId);
    loadMetaPixel(META_PIXEL_ID);
  }

  function choose(marketing: boolean): void {
    const previous = readConsent();
    saveConsent(marketing);
    open = false;
    if (marketing) {
      start();
    } else if (previous?.marketing) {
      // Withdrawn: the trackers are already in memory, so the only way to
      // unload them is a cold reload.
      globalThis.location.reload();
    }
  }

  onMount(() => {
    const consent = readConsent();
    if (consent?.marketing) {
      start();
    } else {
      open = true;
    }
    const onReset = (): void => {
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
      <h2 class="text-base font-semibold text-headings">Adatkezelési hozzájárulás</h2>
      <p class="m-0">
        Az oldal cookie-kkal méri a látogatást és a rendelési konverziókat: Google Analytics /
        Google Ads (Google) és Facebook Pixel (Meta). A mérések csak a hozzájárulásod esetén
        indulnak el, és a választásod bármikor módosítható az Adatvédelmi tájékoztatóban.
      </p>
      <div class="mt-1 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onclick={() => choose(true)}
          class="flex h-11 items-center justify-center rounded-md bg-brown-500 px-4 text-sm font-medium uppercase text-white transition-all hover:bg-brown-700"
        >
          Elfogadom
        </button>
        <button
          type="button"
          onclick={() => choose(false)}
          class="flex h-11 items-center justify-center rounded-md border border-brown-200 bg-white px-4 text-sm font-medium uppercase text-brown-600 transition-all hover:bg-brown-100"
        >
          Elutasítom
        </button>
        <a href="/adatvedelem" class="text-accent underline">Részletek</a>
      </div>
    </div>
  </section>
{/if}
