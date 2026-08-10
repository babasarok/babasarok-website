<script lang="ts">
  import Icon from "@iconify/svelte";
  import Button from "./common/Button.svelte";
  import Tooltip from "./common/Tooltip.svelte";
  import TextInput from "./common/TextInput.svelte";
  import { slide } from "svelte/transition";
  import Color from "./common/Color.svelte";
  import Switch from "./common/Switch.svelte";
  import type { CmsEnhancedEmbroideryColor } from "@/lib/data";
  import type { IProduct, StringValueField } from "@/lib/types.svelte";
  import { isFieldVisible } from "@/lib/fieldVisibility";
  import { randomUUID } from "@/lib/uuid";

  interface Props {
    product: IProduct;
    threadColors: CmsEnhancedEmbroideryColor[];
    onChange?: ((product: IProduct) => void) | undefined;
  }

  const { product, threadColors, onChange }: Props = $props();
</script>

{#snippet Input(field: StringValueField)}
  {#if field.type === "input" || field.value?.is_custom}
    {@const id = randomUUID()}
    <TextInput
      type="text"
      value={field.value?.value ?? ""}
      list={field.type === "input" && field.items ? id : undefined}
      oninput={(e) => {
        if (!(e.target instanceof HTMLInputElement)) {
          return;
        }

        const result = product;
        const fieldToUpdate = result.fields.find((f) => f.name === field.name);
        if (fieldToUpdate) {
          fieldToUpdate.value = {
            value: e.target.value,
            is_custom: field.value?.is_custom || false,
          };
          onChange?.(result);
        }
      }}
    />
    {#if field.type === "input" && field.items}
      {@const items = field.items.filter((item) => item != null)}
      <datalist {id}>
        {#each items as item (item.label)}
          <option value={item.value}>{item.label}</option>
        {/each}
      </datalist>
    {/if}
  {/if}
{/snippet}

<!-- Generic fields -->
<div class="flex flex-col">
  {#each product.fields as field (field.name)}
    {#if isFieldVisible(field, product.fields)}
      <div class="flex flex-col gap-1 mt-2 first:mt-0" transition:slide>
        <p class="text-sm text-brown-500 inline-flex items-center gap-1">
          {field.label || field.name}
          {#if field.tooltip}
            <Tooltip contentProps={{ class: "inline-block" }}>
              {#snippet content()}
                {field.tooltip}
              {/snippet}
              <Icon
                icon="material-symbols:question-mark-rounded"
                class="rounded-full bg-accent text-white p-0.5 text-sm leading-none"
              />
            </Tooltip>
          {/if}
        </p>
        <div class="flex gap-1 flex-wrap">
          {#if field.type === "radio" && "items" in field}
            {@const items = field.items?.filter((item) => item != null)}
            {#each items as item (item.label)}
              {@const selected = field.value?.value === item.value}
              {#snippet button(hasTooltip: boolean)}
                <Button
                  type="button"
                  class="flex items-center gap-0.5"
                  {selected}
                  onclick={() => {
                    const result = product;
                    const fieldToUpdate = result.fields.find((f) => f.name === field.name);
                    if (fieldToUpdate) {
                      fieldToUpdate.value = {
                        value: item.value,
                        is_custom: false,
                      };
                      onChange?.(result);
                    }
                  }}
                >
                  {item.label || item.value}
                  {#if hasTooltip}
                    <Icon icon="material-symbols:question-mark-rounded" class="text-xs" />
                  {/if}
                </Button>
              {/snippet}
              {#if item.tooltip}
                <Tooltip contentProps={{ class: "inline-block" }}>
                  {#snippet content()}
                    {item.tooltip}
                  {/snippet}
                  {@render button(true)}
                </Tooltip>
              {:else}
                {@render button(false)}
              {/if}
            {/each}
            {#if field.allow_custom_value}
              <div transition:slide>
                <Button
                  type="button"
                  selected={field.value?.is_custom ?? false}
                  onclick={() => {
                    const result = product;
                    const fieldToUpdate = result.fields.find((f) => f.name === field.name);
                    if (fieldToUpdate) {
                      fieldToUpdate.value = {
                        value: "",
                        is_custom: true,
                      };
                      onChange?.(result);
                    }
                  }}
                >
                  Egyéb
                </Button>
              </div>
            {/if}
            {@render Input(field)}
          {:else if field.type === "select" && "items" in field}
            {@const items = field.items?.filter((item) => item != null)}
            <select
              value={field.value?.value}
              onchange={(e) => {
                if (!(e.target instanceof HTMLSelectElement)) {
                  return;
                }

                const result = product;
                const fieldToUpdate = result.fields.find((f) => f.name === field.name);
                if (fieldToUpdate) {
                  fieldToUpdate.value = {
                    value: e.target.value,
                    is_custom: false,
                  };
                  onChange?.(result);
                }
              }}
            >
              <option value="" disabled selected>{field.placeholder || "Válassz egy opciót"}</option
              >
              {#each items as item (item.label)}
                <option value={item.value}>
                  {item.label || item.value}
                </option>
              {/each}
            </select>
          {:else if field.type === "input"}
            {@render Input(field)}
          {:else if field.type === "color"}
            {@const items = field.items?.filter((item) => item != null)}
            <div class="flex gap-1 flex-wrap">
              {#each items as item (item.label)}
                {@const selected = field.value?.value === item.value}
                <Color
                  color={{ color_id: item.value, hex: item.value, label: item.label ?? undefined }}
                  {selected}
                  onclick={(color_id) => {
                    const result = product;
                    const fieldToUpdate = result.fields.find((f) => f.name === field.name);
                    if (fieldToUpdate) {
                      fieldToUpdate.value = {
                        value: color_id,
                        is_custom: false,
                      };
                      onChange?.(result);
                    }
                  }}
                />
              {/each}
              {#if field.allow_custom_value}
                <div transition:slide>
                  <Button
                    type="button"
                    selected={field.value?.is_custom ?? false}
                    onclick={() => {
                      const result = product;
                      const fieldToUpdate = result.fields.find((f) => f.name === field.name);
                      if (fieldToUpdate) {
                        fieldToUpdate.value = {
                          value: "",
                          is_custom: true,
                        };
                        onChange?.(result);
                      }
                    }}
                  >
                    Egyéb
                  </Button>
                </div>
              {/if}
            </div>
            {@render Input(field)}
          {:else if field.type === "toggle"}
            <div class="flex">
              <Switch
                checked={field.value?.value ?? false}
                onchange={(e) => {
                  if (!(e.target instanceof HTMLInputElement)) {
                    return;
                  }

                  const result = product;
                  const fieldToUpdate = result.fields.find((f) => f.name === field.name);
                  if (fieldToUpdate) {
                    fieldToUpdate.value = {
                      value: e.target.checked,
                    };
                    onChange?.(result);
                  }
                }}
              />
            </div>
          {:else if field.type === "embroidery"}
            <div class="flex flex-col gap-2">
              <div class="flex">
                <Switch
                  checked={field.value?.enabled ?? false}
                  onchange={(e) => {
                    if (!(e.target instanceof HTMLInputElement)) {
                      return;
                    }

                    const result = product;
                    const fieldToUpdate = result.fields.find((f) => f.name === field.name);
                    if (fieldToUpdate?.type === "embroidery") {
                      fieldToUpdate.value = {
                        enabled: e.target.checked,
                        text: field.value?.text ?? { value: "" },
                        color: field.value?.color ?? { color: "" },
                      };
                      onChange?.(result);
                    }
                  }}
                />
              </div>
              {#if field.value?.enabled}
                {@const embroideryValue = field.value}
                <div class="flex flex-col gap-2" transition:slide>
                  <div class="flex flex-col gap-1">
                    <p class="text-sm text-brown-500">Szöveg</p>
                    <TextInput
                      type="text"
                      value={embroideryValue.text.value}
                      placeholder={field.placeholder ?? undefined}
                      oninput={(e) => {
                        if (!(e.target instanceof HTMLInputElement)) {
                          return;
                        }

                        const result = product;
                        const fieldToUpdate = result.fields.find((f) => f.name === field.name);
                        if (fieldToUpdate?.type === "embroidery") {
                          fieldToUpdate.value = {
                            enabled: true,
                            text: { ...embroideryValue.text, value: e.target.value },
                            color: embroideryValue.color,
                          };
                          onChange?.(result);
                        }
                      }}
                    />
                    {#if embroideryValue.text.error}
                      <p class="text-sm text-red-500">{embroideryValue.text.error}</p>
                    {/if}
                  </div>
                  <div class="flex flex-col gap-1">
                    <p class="text-sm text-brown-500">Cérna szín</p>
                    <div class="flex gap-1 flex-wrap leading-0">
                      {#each threadColors as color (color.color_id)}
                        <Color
                          {color}
                          selected={embroideryValue.color.color === color.color_id}
                          onclick={(colorId) => {
                            const result = product;
                            const fieldToUpdate = result.fields.find((f) => f.name === field.name);
                            if (fieldToUpdate?.type === "embroidery") {
                              fieldToUpdate.value = {
                                enabled: true,
                                text: embroideryValue.text,
                                color: { color: colorId },
                              };
                              onChange?.(result);
                            }
                          }}
                        />
                      {/each}
                    </div>
                    {#if embroideryValue.color.error}
                      <p class="text-sm text-red-500">{embroideryValue.color.error}</p>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          {:else}
            <p>--</p>
          {/if}
        </div>
        {#if field.value?.error}
          <p class="text-sm text-red-500">{field.value.error}</p>
        {/if}
      </div>
    {/if}
  {/each}
</div>
