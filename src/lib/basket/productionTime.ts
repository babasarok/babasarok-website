import { basketProductionDays, type Order } from "./schemas";
import { productionTimeLabel } from "@/lib/productionTime";

type Translate = (key: string, vars?: Record<string, unknown>) => string;

/** The checkout's production-time note: the basket's longest line's time. Undefined when empty. */
export function productionNote(order: Order, translate: Translate): string | undefined {
  const days = basketProductionDays(order);

  if (days === undefined) {
    return undefined;
  }

  return translate("checkout.productionTimeNote", {
    time: productionTimeLabel(days, translate),
  });
}
