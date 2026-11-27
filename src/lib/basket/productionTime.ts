import { basketProductionDays, type Order } from "./schemas";

type Translate = (key: string, vars?: Record<string, unknown>) => string;

/** Weeks when the days divide evenly, otherwise days; singulars worded separately. */
export function productionTimeLabel(days: number, translate: Translate): string {
  if (days >= 7 && days % 7 === 0) {
    const weeks = days / 7;

    if (weeks === 1) {
      return translate("checkout.productionOneWeek");
    }

    return translate("checkout.productionWeeks", { n: weeks });
  }

  if (days === 1) {
    return translate("checkout.productionOneDay");
  }

  return translate("checkout.productionDays", { n: days });
}

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
