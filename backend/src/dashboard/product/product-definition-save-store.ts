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
export function publishConfiguratorSave(
  definitionId: string,
  handle: ConfiguratorSaveHandle
): void {
  const previous = handles.get(definitionId);

  handles.set(definitionId, handle);

  if (previous?.dirty !== handle.dirty) {
    notify();
  }
}

export function unpublishConfiguratorSave(definitionId: string): void {
  handles.delete(definitionId);
  notify();
}

export function getConfiguratorSave(definitionId: string): ConfiguratorSaveHandle | undefined {
  return handles.get(definitionId);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function useConfiguratorDirty(definitionId: string): boolean {
  return useSyncExternalStore(subscribe, () => handles.get(definitionId)?.dirty ?? false);
}

export function useConfiguratorSave(definitionId: string): ConfiguratorSaveHandle | undefined {
  return useSyncExternalStore(subscribe, () => handles.get(definitionId));
}
