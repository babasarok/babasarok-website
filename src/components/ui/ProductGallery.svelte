<script lang="ts">
  import Icon from "@iconify/svelte";
  import type { GalleryImage } from "@/lib/catalog/productPage";
  import VendureImage from "./VendureImage.svelte";

  interface Props {
    images: GalleryImage[];
    previousLabel: string;
    nextLabel: string;
  }

  let { images, previousLabel, nextLabel }: Props = $props();

  const presets = ["hero-sm", "hero-md", "hero-lg"] as const;
  const sizes = "(min-width: 992px) 940px, 90vw";

  let current = $state(0);

  function show(offset: number): void {
    current = (current + offset + images.length) % images.length;
  }
</script>

{#if images.length === 1}
  <div class="w-full overflow-hidden rounded-[30px]">
    <VendureImage
      src={images[0].src}
      alt={images[0].alt}
      {presets}
      {sizes}
      class="mx-auto h-75 rounded-[20px] object-cover sm:h-125"
    />
  </div>
{:else if images.length > 1}
  <div class="w-full overflow-hidden rounded-[30px]">
    <div class="relative">
      <div class="overflow-hidden rounded-[20px]">
        <div
          class="flex items-start transition-transform duration-450 ease-out"
          style:transform={`translateX(-${current * 100}%)`}
        >
          {#each images as image, index (image.src)}
            <div class="flex min-w-full flex-col items-center" inert={index !== current}>
              <VendureImage
                src={image.src}
                alt={image.alt}
                {presets}
                {sizes}
                loading={index === 0 ? "eager" : "lazy"}
                class="h-75 w-auto max-w-full rounded-[20px] object-cover sm:h-125"
              />
              {#if image.description}
                <p class="mt-3 text-center text-black">{image.description}</p>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <div
        class="pointer-events-none absolute inset-x-0 top-0 z-2 flex h-75 items-center justify-between px-2 sm:h-125"
      >
        <button
          type="button"
          class="bg-accent pointer-events-auto grid size-9 cursor-pointer place-items-center rounded-full text-white transition-transform hover:scale-105 active:scale-95 sm:size-10.5"
          aria-label={previousLabel}
          onclick={() => {
            show(-1);
          }}
        >
          <Icon icon="tabler:chevron-left" class="block text-xl" />
        </button>
        <button
          type="button"
          class="bg-accent pointer-events-auto grid size-9 cursor-pointer place-items-center rounded-full text-white transition-transform hover:scale-105 active:scale-95 sm:size-10.5"
          aria-label={nextLabel}
          onclick={() => {
            show(1);
          }}
        >
          <Icon icon="tabler:chevron-right" class="block text-xl" />
        </button>
      </div>
    </div>
  </div>
{/if}
