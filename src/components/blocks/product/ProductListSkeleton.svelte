<script lang="ts">
  import { PRODUCT_TYPES } from "@/lib/product/productTypes";

  const SET_ROWS = 3;
  const CARDS = 12;
</script>

{#snippet checkboxRows(count: number)}
  <div class="flex flex-col gap-1.5">
    {#each { length: count }, index (index)}
      <div class="flex h-5 items-center gap-2.5">
        <div class="bg-brown-100 size-4 rounded-sm"></div>
        <div class="bg-brown-100 h-3.5 w-32 rounded-md"></div>
      </div>
    {/each}
  </div>
{/snippet}

<div class="flex animate-pulse flex-col gap-10 sm:flex-row sm:gap-12">
  <div class="hidden w-full shrink-0 sm:block sm:w-60">
    <div class="bg-brown-100 mb-2.5 h-6 w-24 rounded-md"></div>
    <div class="bg-brown-100 h-10.5 rounded-full"></div>
    <div class="bg-brown-100 mt-3 mb-2.5 h-6 w-28 rounded-md"></div>
    {@render checkboxRows(PRODUCT_TYPES.length)}
    <div class="bg-brown-100 mt-8 mb-2.5 h-6 w-24 rounded-md"></div>
    {@render checkboxRows(SET_ROWS)}
  </div>
  <div class="min-w-0 flex-1">
    <div class="mb-8 flex items-center gap-2 sm:hidden">
      <div class="bg-brown-100 h-10.5 min-w-0 flex-1 rounded-full"></div>
      <div class="bg-brown-100 h-10.5 w-20 shrink-0 rounded-full"></div>
      <div class="bg-brown-100 h-10.5 w-24 shrink-0 rounded-full"></div>
    </div>
    <div class="mb-8 hidden justify-end sm:flex">
      <div class="bg-brown-100 h-10.5 w-36 rounded-full"></div>
    </div>
    <div
      class="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-8 gap-y-12 px-4 sm:gap-y-8 sm:px-0"
    >
      {#each { length: CARDS }, index (index)}
        <div class="flex flex-col items-center sm:items-start">
          <div class="bg-brown-100 aspect-square w-full rounded-[20px]"></div>
          <div class="bg-brown-100 mt-3.5 h-3.5 w-20 rounded-md"></div>
          <div class="bg-brown-100 mt-1.5 h-6 w-3/4 rounded-md"></div>
        </div>
      {/each}
    </div>
  </div>
</div>
