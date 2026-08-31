import {
  ORDER_STORAGE_KEY,
  isSameBasketItem,
  loadBasketProducts,
  mapProductToSaved,
  updateBasketProducts,
  type SavedProduct,
} from "./storage";
import { restoreProducts } from "./product";
import type { CmsEnhancedProduct } from "../data";
import type { IProduct } from "../types.svelte";

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

  /** Drop the whole basket when it can no longer be cleanly restored against the
   * current catalog (any line missing or structurally changed). Partial restore
   * would silently lose items and confuse the user, so it's all-or-nothing. */
  pruneAgainstCatalog(catalog: Record<string, CmsEnhancedProduct>): void {
    if (
      this.items.length > 0 &&
      restoreProducts($state.snapshot(this.items), catalog).length === 0
    ) {
      this.clear();
    }
  }

  get count(): number {
    return this.items.reduce((sum, item) => sum + item.count, 0);
  }

  get(uuid: string): SavedProduct | undefined {
    return this.items.find((item) => item.uuid === uuid);
  }

  /**
   * Insert a new item, replace the existing line with the same uuid, or — when
   * the line is a duplicate of another line (same product, materials and field
   * values) — merge its count into that line. Returns the uuid of the line that
   * now holds the item: the item's own uuid when inserted/replaced, the
   * surviving line's uuid when merged (the merged uuid is then gone from the
   * basket, so callers must re-point their references to the returned uuid).
   */
  upsert(product: IProduct): string {
    const saved = mapProductToSaved(product);
    const next = updateBasketProducts((products) => {
      const index = products.findIndex((p) => p.uuid === saved.uuid);
      if (index !== -1) {
        const copy = [...products];
        copy[index] = saved;
        return copy;
      }
      const duplicate = products.find((p) => isSameBasketItem(p, saved));
      if (duplicate) {
        const copy = [...products];
        const dupIndex = copy.indexOf(duplicate);
        copy[dupIndex] = { ...duplicate, count: duplicate.count + saved.count };
        return copy;
      }
      return [...products, saved];
    });
    this.items = next.products;
    this.#notify();
    const surviving = next.products.find((p) => p.uuid === saved.uuid);
    return (
      surviving?.uuid ?? next.products.find((p) => isSameBasketItem(p, saved))?.uuid ?? saved.uuid
    );
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
