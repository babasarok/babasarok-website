type Translate = (key: string, vars?: Record<string, unknown>) => string;

/** Weeks when the days divide evenly, otherwise days; singulars worded separately. */
export function productionTimeLabel(days: number, translate: Translate): string {
  if (days >= 7 && days % 7 === 0) {
    const weeks = days / 7;

    if (weeks === 1) {
      return translate("productionTime.week");
    }

    return translate("productionTime.weeks", { n: weeks });
  }

  if (days === 1) {
    return translate("productionTime.day");
  }

  return translate("productionTime.days", { n: days });
}
