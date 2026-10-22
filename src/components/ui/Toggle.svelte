<script lang="ts">
  let { checked = $bindable(), disabled = false }: { checked: boolean; disabled?: boolean } =
    $props();
</script>

<label class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center">
  <input type="checkbox" {disabled} bind:checked class="peer sr-only" />
  <span
    class={[
      "h-6 w-11 rounded-full bg-brown-200 transition-colors peer-disabled:bg-gray-200 peer-disabled:cursor-not-allowed",
      "after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform after:content-[''] peer-disabled:after:bg-gray-400",
      "peer-checked:bg-brown-500 peer-checked:after:translate-x-5",
      "peer-focus-visible:ring-2 peer-focus-visible:ring-brown-500 peer-focus-visible:ring-offset-2",
    ]}
  ></span>
</label>
