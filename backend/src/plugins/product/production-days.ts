export const CONFIGURATOR_PRODUCTION_DAYS = 21;
export const READY_MADE_PRODUCTION_DAYS = 7;

/** The per-kind production-time defaults, resolved from the channel's settings. */
export interface ProductionDefaults {
  configurator: number;
  readyMade: number;
}

/** The channel's configured defaults, falling back to 3 weeks / 1 week when unset. */
export function productionDefaults(
  configurator: number | null | undefined,
  readyMade: number | null | undefined
): ProductionDefaults {
  return {
    configurator: configurator ?? CONFIGURATOR_PRODUCTION_DAYS,
    readyMade: readyMade ?? READY_MADE_PRODUCTION_DAYS,
  };
}

/**
 * The product's production time in days: the dashboard override wins, otherwise
 * the kind's channel-configured default.
 */
export function resolveProductionDays(
  override: number | null | undefined,
  hasDefinition: boolean,
  defaults: ProductionDefaults
): number {
  if (override !== null && override !== undefined) {
    return override;
  }

  return hasDefinition ? defaults.configurator : defaults.readyMade;
}
