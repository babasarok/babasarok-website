import { describe, expect, it } from "vitest";
import type { Order, OrderLine } from "./schemas";
import { productionNote } from "./productionTime";

const translate = (key: string, vars?: Record<string, unknown>): string => {
  const table: Record<string, string> = {
    "checkout.productionTimeNote": `NOTE ${String(vars?.time)}`,
    "productionTime.weeks": `${String(vars?.n)} weeks`,
    "productionTime.week": "1 week",
    "productionTime.days": `${String(vars?.n)} days`,
    "productionTime.day": "1 day",
  };

  return table[key];
};

const line = (productionTimeDays: number): OrderLine =>
  ({
    productVariant: { product: { productionTimeDays } },
  }) as unknown as OrderLine;

const order = (lines: OrderLine[]): Order => ({ lines }) as unknown as Order;

describe("productionNote", () => {
  it("shows the longest line's production time", () => {
    expect(productionNote(order([line(7), line(21)]), translate)).toBe("NOTE 3 weeks");
    expect(productionNote(order([line(21), line(3)]), translate)).toBe("NOTE 3 weeks");
    expect(productionNote(order([line(3)]), translate)).toBe("NOTE 3 days");
    expect(productionNote(order([line(7)]), translate)).toBe("NOTE 1 week");
  });

  it("is undefined for an empty basket", () => {
    expect(productionNote(order([]), translate)).toBeUndefined();
  });
});
