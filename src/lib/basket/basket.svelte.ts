import { PUBLIC_VENDURE_API_URL } from "astro:env/client";
import { pageLanguageCode } from "@/lib/vendure/client";
import { createBasketApi, type LineInput, type Result } from "./api";
import type { Order } from "./schemas";
import { loadActiveOrder } from "./tokenRejection";
import { loadShownPrices, rememberShownPrice, type ShownPrices } from "./stale";
import {
  BASKET_STORAGE_KEYS,
  announceBasketChange,
  createTokenStore,
  dropLegacyBasket,
} from "./storage";

function priceStorage(): Storage | null {
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * The single live basket (the Vendure active order) shared by every order
 * island on the page. Other tabs announce their changes through localStorage;
 * every mutation result replaces the order wholesale.
 */
class Basket {
  order = $state<Order | null>(null);
  loaded = $state(false);
  loadFailed = $state(false);
  shownPrices = $state<ShownPrices>({});
  #started = false;

  readonly #tokens = createTokenStore();

  readonly api = createBasketApi({
    fetch: (input, init) => fetch(input, init),
    apiUrl: PUBLIC_VENDURE_API_URL,
    languageCode: () => pageLanguageCode(globalThis.location.pathname),
    tokens: this.#tokens,
  });

  get count(): number {
    return this.order?.totalQuantity ?? 0;
  }

  start(): void {
    if (this.#started) {
      return;
    }

    this.#started = true;
    dropLegacyBasket();
    this.shownPrices = loadShownPrices(priceStorage());
    globalThis.addEventListener("storage", (event) => {
      if (event.key !== null && BASKET_STORAGE_KEYS.includes(event.key)) {
        void this.refresh();
      }
    });
    void this.refresh();
  }

  async refresh(): Promise<void> {
    const load = await loadActiveOrder({
      activeOrder: () => this.api.activeOrder(),
      discardToken: () => this.#tokens.clear(),
    });

    this.loaded = true;
    this.loadFailed = load === null;

    if (load !== null) {
      this.order = load.order;
      this.shownPrices = loadShownPrices(priceStorage());
    }
  }

  #apply(result: Result<Order>): Result<Order> {
    if (result.ok) {
      this.order = result.value;
      announceBasketChange();
    }

    return result;
  }

  add(input: LineInput): Promise<Result<Order>> {
    return this.api.addItem(input).then((result) => this.#apply(result));
  }

  adjust(orderLineId: string, quantity: number): Promise<Result<Order>> {
    return this.api.adjustLine(orderLineId, quantity).then((result) => this.#apply(result));
  }

  remove(orderLineId: string): Promise<Result<Order>> {
    return this.api.removeLine(orderLineId).then((result) => this.#apply(result));
  }

  setShippingMethod(shippingMethodId: string): Promise<Result<Order>> {
    return this.api.setShippingMethod(shippingMethodId).then((result) => this.#apply(result));
  }

  rememberShownPrice(lineId: string, price: number): void {
    rememberShownPrice(priceStorage(), lineId, price);
    this.shownPrices = loadShownPrices(priceStorage());
  }

  finish(): void {
    this.order = null;
    announceBasketChange();
  }
}

export const basket = new Basket();
