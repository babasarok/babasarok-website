import { useSyncExternalStore } from "react";

/** Whether the stock new-product page's Konfigurátor toggle is on. The
 * toggle lives in the unified save action-bar item; the create-page block
 * and the save button both read it from here, because the block API has no
 * channel to push action-bar state into page blocks. */
let enabled = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function useConfiguratorCreate(): boolean {
  return useSyncExternalStore(subscribe, () => enabled);
}

export function setConfiguratorCreate(value: boolean): void {
  if (enabled === value) {
    return;
  }

  enabled = value;
  notify();
}

/** Called when the create-page block unmounts: navigating away from the
 * new-product page must not leave the toggle on for the next visit. */
export function resetConfiguratorCreate(): void {
  setConfiguratorCreate(false);
}
