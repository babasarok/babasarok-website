import type { TokenStore } from "./api";

const TOKEN_KEY = "babasarok-basket-token-v1";
const REVISION_KEY = "babasarok-basket-revision";
const LEGACY_BASKET_KEY = "babasarok-order-state";

export const BASKET_STORAGE_KEYS: readonly string[] = [TOKEN_KEY, REVISION_KEY];

function getStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function createTokenStore(): TokenStore {
  let memory: string | null = null;

  return {
    get() {
      return getStorage()?.getItem(TOKEN_KEY) ?? memory;
    },
    set(token) {
      memory = token;

      try {
        getStorage()?.setItem(TOKEN_KEY, token);
      } catch {
        // Persisting is best effort: the basket still works in-session.
      }
    },
    clear() {
      memory = null;

      try {
        getStorage()?.removeItem(TOKEN_KEY);
      } catch {
        // Nothing to clear when storage is unavailable.
      }
    },
  };
}

export function announceBasketChange(): void {
  try {
    getStorage()?.setItem(REVISION_KEY, String(Date.now()));
  } catch {
    // Other tabs just miss the hint.
  }
}

export function dropLegacyBasket(): void {
  try {
    getStorage()?.removeItem(LEGACY_BASKET_KEY);
  } catch {
    // Nothing to drop when storage is unavailable.
  }
}
