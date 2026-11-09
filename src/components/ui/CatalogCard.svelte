<script lang="ts">
  import VendureImage from "./VendureImage.svelte";

  interface Props {
    href: string;
    title: string;
    /** Vendure asset source (see `imageUrl`). */
    image?: string | undefined;
    category?: string | undefined;
    detailsLabel: string;
    /** Square, uniform-height variant used by the landing product grid. */
    square?: boolean;
  }

  let { href, title, image, category, detailsLabel, square = false }: Props = $props();
</script>

<div
  class="group flex w-full max-w-62.5 flex-col items-center p-0 sm:items-stretch lg:w-1/2 lg:p-7.5"
  data-pagefind-ignore
>
  {#if image}
    <VendureImage
      src={image}
      alt={title}
      presets={["card-sm", "card-lg"]}
      sizes="(max-width: 575px) 50vw, 300px"
      loading="lazy"
      class={[
        "mx-auto w-full max-w-[50vw] rounded-[20px] transition-all duration-300 group-hover:shadow-[0_20px_40px_0_rgba(0,0,0,0.12)] sm:mx-0 sm:max-w-75",
        square && "aspect-square object-cover",
      ]}
    />
  {/if}
  <div
    class={[
      "flex flex-col items-center text-center sm:items-stretch sm:text-start",
      square && "flex-1",
    ]}
  >
    {#if category}
      <span
        class="text-body mt-3.5 mb-2.5 block text-[0.9rem] leading-none sm:mt-7 sm:mb-5 sm:text-lg"
      >
        {category}
      </span>
    {/if}
    <h3 class="text-h3 text-headings mb-0">
      <a class="text-dark hover:text-sand-300" {href}>{title}</a>
    </h3>
    <a
      {href}
      class="text-sand-300 before:bg-sand-300 relative ml-7.5 inline-block origin-bottom scale-y-100 transition-all duration-300 group-hover:scale-y-100 before:absolute before:top-1/2 before:-left-7.5 before:h-0.5 before:w-5 before:-translate-y-1/2 before:content-[''] lg:scale-y-0"
    >
      {detailsLabel}
    </a>
  </div>
</div>
