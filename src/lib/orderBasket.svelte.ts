import {
  ORDER_STORAGE_KEY,
  loadBasketProducts,
  mapProductToSaved,
  updateBasketProducts,
  type SavedProduct,
} from "./orderStorage";
import type { IProduct } from "./types.svelte";

/** Fired on the window whenever the basket changes, so islands that don't share
 * a module instance (separate Astro hydration roots) still stay in sync. */
const BASKET_CHANGED_EVENT = "babasarok:basket-changed";

/**
 * A single reactive view of the persisted basket, shared by every order island
 * on the page (product configurator, nav basket). It reads/writes the same
 * localStorage the checkout form uses, and mirrors changes from other tabs
 * (`storage` event) and other islands (custom event).
 */
class OrderBasket {
  items = $state<SavedProduct[]>([]);
  #started = false;

  /** Hydrate from storage and start listening. Safe to call from every island;
   * only the first call does work. Only reached client-side (via `onMount`). */
  start(): void {
    if (this.#started) {
      return;
    }
    this.#started = true;
    this.#refresh();
    globalThis.addEventListener("storage", (event) => {
      if (event.key === ORDER_STORAGE_KEY) {
        this.#refresh();
      }
    });
    globalThis.addEventListener(BASKET_CHANGED_EVENT, () => {
      this.#refresh();
    });
  }

  #refresh(): void {
    this.items = loadBasketProducts();
  }

  get count(): number {
    return this.items.reduce((sum, item) => sum + item.count, 0);
  }

  get(uuid: string): SavedProduct | undefined {
    return this.items.find((item) => item.uuid === uuid);
  }

  /** Insert a new item or replace the existing one with the same uuid. */
  upsert(product: IProduct): void {
    const saved = mapProductToSaved(product);
    const next = updateBasketProducts((products) => {
      const index = products.findIndex((p) => p.uuid === saved.uuid);
      if (index === -1) {
        return [...products, saved];
      }
      const copy = [...products];
      copy[index] = saved;
      return copy;
    });
    this.items = next.products;
    this.#notify();
  }

  remove(uuid: string): void {
    const next = updateBasketProducts((products) => products.filter((p) => p.uuid !== uuid));
    this.items = next.products;
    this.#notify();
  }

  /** Empty the basket (e.g. after a successful order submission). */
  clear(): void {
    const next = updateBasketProducts(() => []);
    this.items = next.products;
    this.#notify();
  }

  #notify(): void {
    globalThis.dispatchEvent(new CustomEvent(BASKET_CHANGED_EVENT));
  }
}

export const orderBasket = new OrderBasket();
