import type { ReadableAtom } from "nanostores";
import type { Remote } from "./store";

export interface RemoteValue<T> {
  readonly current: Remote<T>;
  retry: () => void;
}

/**
 * Follows a catalog store entry from inside a component. The store is only
 * touched in the browser, so prerendering never calls the backend.
 */
export function remoteValue<T>(access: () => ReadableAtom<Remote<T>>): RemoteValue<T> {
  let current = $state<Remote<T>>({ status: "loading" });

  $effect(() =>
    access().subscribe((value) => {
      current = value;
    })
  );

  return {
    get current() {
      return current;
    },
    retry: () => {
      access();
    },
  };
}
