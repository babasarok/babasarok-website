<script lang="ts">
  import Icon from "@iconify/svelte";
  import Dialog from "@/components/ui/Dialog.svelte";
  import {
    search,
    setOptions,
    type PagefindSearchFragment,
    type PagefindSection,
  } from "@/lib/pagefind";
  import { onMount } from "svelte";

  onMount(() => {
    void setOptions({ excerptLength: 10 });
  });

  let callSeq = 0;

  let query = $state("");
  let searching = $state(false);
  let failed = $state(false);
  let results = $state<PagefindSearchFragment[]>([]);

  async function onInput(event: Event): Promise<void> {
    query = (event.target as HTMLInputElement).value;
    const term = query.trim();
    const seq = ++callSeq;

    if (!term) {
      results = [];
      failed = false;
      searching = false;
      return;
    }

    searching = true;

    try {
      const response = await search(term);
      const found = await Promise.all(response.results.map((result) => result.data()));

      if (seq === callSeq) {
        // Products always rank first, in their relative order; everything after in its own order.
        results = found.toSorted(
          (a, b) => Number(a.meta.section !== "product") - Number(b.meta.section !== "product")
        );
      }
    } catch {
      if (seq === callSeq) {
        failed = true;
        results = [];
      }
    } finally {
      if (seq === callSeq) {
        searching = false;
      }
    }
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && results[0]) {
      globalThis.location.assign(results[0].url);
    }
  }

  const SECTION_NAME: Record<PagefindSection, string> = {
    product: "Termékek",
    material: "Anyagok",
    blog: "Referenciamunkák",
  };
</script>

<Dialog
  aria-label="Keresés"
  onClose={() => {
    searching = false;
    failed = false;
    query = "";
    results = [];
  }}
>
  {#snippet button(id)}
    <button
      type="button"
      commandfor={id}
      command="show-modal"
      aria-label="Keresés"
      class="flex cursor-pointer items-center gap-1 p-2 text-dark transition-colors hover:text-sand-300"
    >
      <Icon icon="mdi:magnify" class="text-2xl" />
    </button>
  {/snippet}
  {#snippet content(close)}
    <div class="flex items-center gap-2">
      <input
        type="search"
        aria-label="Keresés"
        placeholder="Keresés…"
        value={query}
        oninput={(event) => void onInput(event)}
        onkeydown={onKeydown}
        class="w-full rounded-lg border border-brown-200 px-4 py-2.5 text-dark outline-none focus:border-accent"
      />
      <button
        type="button"
        onclick={close}
        aria-label="Bezárás"
        class="flex shrink-0 cursor-pointer rounded-full p-1.5 text-brown-500 transition-colors hover:bg-brown-100 hover:text-dark"
      >
        <Icon icon="mdi:close" class="text-2xl" />
      </button>
    </div>
    {#if query.trim()}
      <p class="mt-3 text-sm text-brown-500" aria-live="polite">
        {#if searching}
          Keresés…
        {:else if failed}
          A keresés jelenleg nem elérhető.
        {:else}
          {results.length}
          találat
        {/if}
      </p>
      <ul class="mt-2 flex max-h-[60dvh] flex-col gap-1 overflow-y-auto">
        {#each results as result (result.url)}
          <li>
            <a
              href={result.url}
              class="flex flex-col rounded-lg p-3 transition-colors hover:bg-sand-50"
            >
              <span class="font-medium text-dark whitespace-nowrap text-ellipsis overflow-hidden"
                >{result.meta.title}</span
              >
              {#if result.meta.section}
                <span class="shrink-0 text-xs text-brown-500"
                  >{SECTION_NAME[result.meta.section]}</span
                >
              {/if}
              {#if result.excerpt}
                <span
                  class="mt-1 block text-sm text-body [&_mark]:bg-sand-100 [&_mark]:text-inherit"
                >
                  <!-- eslint-disable-next-line svelte/no-at-html-tags - Pagefind's excerpts are entity-encoded, only <mark> is injected -->
                  {@html result.excerpt}
                </span>
              {/if}
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  {/snippet}
</Dialog>
