<script lang="ts">
  import Icon from "@iconify/svelte";
  import Button from "./common/Button.svelte";
  import Tooltip from "./common/Tooltip.svelte";
  import { v4 } from "uuid";
  import { slide } from "svelte/transition";
  import Color from "./common/Color.svelte";
  import Switch from "./common/Switch.svelte";
  import type { IProduct, Field } from "@/lib/Product.svelte";

  interface Props {
    product: IProduct;
    onChange?: ((product: IProduct) => void) | undefined;
  }

  const { product, onChange }: Props = $props();
</script>

{#snippet Input(field: Field)}
  {#if field.type === "input" || field.value?.is_custom}
    {@const id = v4()}
    <input
      class="text-sm border rounded bg-white px-2 py-1 border-border w-full focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
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
      {@const id = v4()}
      <datalist {id}>
        {#each items as item (item.label)}
          <option value={item.value}>{item.label}</option>
        {/each}
      </datalist>
    {/if}
  {/if}
{/snippet}

<!-- Generic fields -->
{#each product.fields as field (field.name)}
  <div class="flex flex-col gap-1">
    <p class="text-sm text-primary-500">{field.label || field.name}</p>
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
          <option value="" disabled selected>{field.placeholder || "Válassz egy opciót"}</option>
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
            checked={field.value?.value === "true"}
            onchange={(e) => {
              if (!(e.target instanceof HTMLInputElement)) {
                return;
              }

              const result = product;
              const fieldToUpdate = result.fields.find((f) => f.name === field.name);
              if (fieldToUpdate) {
                fieldToUpdate.value = {
                  value: e.target.checked ? "true" : "false",
                  is_custom: false,
                };
                onChange?.(result);
              }
            }}
          />
        </div>
      {:else}
        <p>--</p>
      {/if}
    </div>
    {#if field.value?.error}
      <p class="text-sm text-red-500">{field.value.error}</p>
    {/if}
  </div>
{/each}
