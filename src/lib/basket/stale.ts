import { z } from "zod";
import type { ConfiguredLine } from "./lineInput";
import type { Order, OrderLine } from "./schemas";

const SHOWN_PRICES_KEY = "babasarok-basket-shown-prices-v1";
const ShownPricesSchema = z.record(z.string(), z.number());

export type ShownPrices = z.output<typeof ShownPricesSchema>;

export type PriceStorage = Pick<Storage, "getItem" | "setItem"> | null;

export interface PriceChange {
  shown: number;
  actual: number;
}

export function loadShownPrices(storage: PriceStorage): ShownPrices {
  try {
    const raw = storage?.getItem(SHOWN_PRICES_KEY);
    const parsed = ShownPricesSchema.safeParse(raw ? JSON.parse(raw) : {});

    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function rememberShownPrice(storage: PriceStorage, lineId: string, price: number): void {
  try {
    storage?.setItem(
      SHOWN_PRICES_KEY,
      JSON.stringify({ ...loadShownPrices(storage), [lineId]: price })
    );
  } catch {
    // Without storage the notice only shows on the page that added the line.
  }
}

export function priceChange(line: OrderLine, shown: ShownPrices): PriceChange | undefined {
  const shownPrice = shown[line.id];

  if (shownPrice === undefined || shownPrice === line.unitPriceWithTax) {
    return undefined;
  }

  return { shown: shownPrice, actual: line.unitPriceWithTax };
}

export function lineMatches(line: OrderLine, configured: ConfiguredLine): boolean {
  return (
    line.productVariant.id === configured.variantId &&
    (line.customFields?.selections ?? "") === configured.selections &&
    (line.customFields?.lengthCm ?? undefined) === configured.lengthCm
  );
}

export function findLine(order: Order, configured: ConfiguredLine): OrderLine | undefined {
  return order.lines.find((line) => lineMatches(line, configured));
}
