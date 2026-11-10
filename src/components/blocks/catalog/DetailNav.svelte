<script lang="ts">
  import Icon from "@iconify/svelte";
  import type { NavLink } from "@/lib/catalog/productPage";

  interface Props {
    previous: NavLink | undefined;
    next: NavLink | undefined;
    previousLabel: string;
    nextLabel: string;
    shareUrl: string;
  }

  let { previous, next, previousLabel, nextLabel, shareUrl }: Props = $props();

  const shareLinks = $derived([
    {
      icon: "fa-brands:facebook",
      label: "Facebook",
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
    },
    {
      icon: "fa-brands:linkedin",
      label: "LinkedIn",
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`,
    },
    {
      icon: "fa-brands:twitter",
      label: "Twitter",
      href: `https://twitter.com/intent/tweet?&url=${encodeURIComponent(shareUrl)}`,
    },
  ]);
</script>

<nav class="flex items-center justify-between gap-4 sm:gap-8">
  {#if previous}
    <a class="group flex items-center" href={previous.href}>
      <span class="text-dark mr-3 leading-none">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="15.556"
          height="28.285"
          viewBox="0 0 15.556 28.285"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M3.391 12.728l9.75 14.142-.982 1.414-9.742-14.142z" />
          <path d="M13.137 1.41L3.39 15.558l-.975-1.415L12.166 0z" />
        </svg>
      </span>
      <span class="text-left">
        <span class="text-body block text-sm">{previousLabel}</span>
        <span class="font-heading text-dark group-hover:text-sand-300 block text-xl">
          {previous.label}
        </span>
      </span>
    </a>
  {:else}
    <span></span>
  {/if}

  <ul class="hidden items-center sm:flex">
    {#each shareLinks as link (link.icon)}
      <li class="not-last:mr-6">
        <a
          class="text-body hover:text-sand-300 block transition-colors hover:scale-110"
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={link.label}
        >
          <Icon icon={link.icon} class="text-lg" />
        </a>
      </li>
    {/each}
  </ul>

  {#if next}
    <a class="group flex items-center" href={next.href}>
      <span class="text-right">
        <span class="text-body block text-sm">{nextLabel}</span>
        <span class="font-heading text-dark group-hover:text-sand-300 block text-xl">
          {next.label}
        </span>
      </span>
      <span class="text-dark ml-3 leading-none">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="15.556"
          height="28.285"
          viewBox="0 0 15.556 28.285"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12.162 12.725L2.416 26.87l.978 1.41 9.746-14.138z" />
          <path d="M2.416 1.415l9.743 14.141.975-1.414L3.39 0z" />
        </svg>
      </span>
    </a>
  {:else}
    <span></span>
  {/if}
</nav>
