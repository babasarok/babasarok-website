import { useSyncExternalStore } from "react";

export interface ConfiguratorSaveHandle {
  dirty: boolean;
  save: () => Promise<void>;
}

const handles = new Map<string, ConfiguratorSaveHandle>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** Publishes a product's configurator save handle for the page's Update
 * button. */
export function publishConfiguratorSave(productId: string, handle: ConfiguratorSaveHandle): void {
  const previous = handles.get(productId);

  handles.set(productId, handle);

  if (previous?.dirty !== handle.dirty) {
    notify();
  }
}

export function unpublishConfiguratorSave(productId: string): void {
  handles.delete(productId);
  notify();
}

export function getConfiguratorSave(productId: string): ConfiguratorSaveHandle | undefined {
  return handles.get(productId);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function useConfiguratorDirty(productId: string): boolean {
  return useSyncExternalStore(subscribe, () => handles.get(productId)?.dirty ?? false);
}
