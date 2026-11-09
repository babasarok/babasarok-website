<script lang="ts">
  import { cn } from "@/lib/cn";
  import { renderMarkdown } from "@/lib/markdown/renderMarkdown";
  import { ASSET_BASE } from "@/lib/vendure/client";

  interface Props {
    source: string;
    class?: string | undefined;
  }

  let { source, class: className }: Props = $props();
</script>

<div class={cn("prose max-w-none", className)}>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- renderMarkdown escapes raw HTML and only lets safe link and image URLs through -->
  {@html renderMarkdown(source, ASSET_BASE)}
</div>
