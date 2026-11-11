<script lang="ts">
  import Icon from "@iconify/svelte";
  import I18nGate from "@/components/ui/I18nGate.svelte";
  import type { i18n as I18n } from "i18next";
  import type { Locale } from "@/lib/i18n";
  import { STEPS, stepIndex, type StepId } from "@/lib/basket/steps";
  import { translateMessage } from "@/lib/i18next-client";

  interface Props {
    locale: Locale;
    current: StepId;
    onJump: (step: StepId) => void;
  }

  let { locale, current, onJump }: Props = $props();

  const currentIndex = $derived(stepIndex(current));
</script>

<I18nGate {locale}>
  {#snippet children(i18n: I18n)}
    <nav>
      <ol class="flex w-full items-start">
        {#each STEPS as stepDef, index (stepDef.id)}
          {@const completed = index < currentIndex}
          {@const active = index === currentIndex}
          <li class="relative flex min-w-0 flex-1 flex-col items-center gap-1.5">
            {#if index > 0}
              <span
                aria-hidden="true"
                class="absolute top-[18px] h-px -translate-y-1/2 bg-brown-200 left-[calc(-50%_+_18px)] w-[calc(100%_-_36px)] {index <=
                currentIndex
                  ? 'bg-brown-500'
                  : ''}"
              ></span>
            {/if}

            {#if completed}
              <button
                type="button"
                onclick={() => onJump(stepDef.id)}
                aria-label={translateMessage(i18n, stepDef.labelKey)}
                class="z-10 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-brown-500 text-white transition-colors hover:bg-brown-700"
              >
                <Icon icon="mdi:check" class="text-lg" />
              </button>
            {:else}
              <span
                aria-current={active ? "step" : undefined}
                class="z-10 flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-medium {active
                  ? 'border-brown-700 bg-brown-700 text-white'
                  : 'border-brown-200 bg-white text-brown-600'}"
              >
                {index + 1}
              </span>
            {/if}

            {#if index < STEPS.length - 1}
              <span
                aria-hidden="true"
                class="absolute top-[18px] h-px -translate-y-1/2 bg-brown-200 left-[calc(50%_+_18px)] w-[calc(100%_-_36px)] {index <
                currentIndex
                  ? 'bg-brown-500'
                  : ''}"
              ></span>
            {/if}

            <span
              class="hidden text-center text-xs leading-snug font-medium text-brown-600 sm:block {active
                ? 'font-semibold text-brown-700'
                : ''}"
            >
              {translateMessage(i18n, stepDef.labelKey)}
            </span>
          </li>
        {/each}
      </ol>
    </nav>
  {/snippet}
</I18nGate>
