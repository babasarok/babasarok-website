<script lang="ts">
  import type { SlimImage } from "@/lib/data";

  interface Props {
    href: string;
    title: string;
    category?: string | undefined | null;
    image?: SlimImage | undefined | null;
  }

  let { href, title, category, image }: Props = $props();
</script>

<a {href} class="group flex h-full w-full sm:w-32 flex-col items-center sm:items-start lg:w-50">
  {#if image}
    <img
      src={image.src}
      srcset={image.srcSet.attribute || undefined}
      {...image.attributes}
      alt={title}
      class="aspect-square w-full rounded-[20px] object-cover transition-all duration-300 group-hover:shadow-[0_20px_40px_0_rgba(0,0,0,0.12)]"
    />
  {/if}
  {#if category}
    <span class="text-body mt-3.5 block text-sm leading-none">{category}</span>
  {/if}
  <h3
    class="text-h5 text-dark mt-1.5 text-center leading-tight group-hover:text-sand-300 sm:text-start"
  >
    {title}
  </h3>
</a>
