// Declaration merging for the custom fields defined in vendure-config.ts:
// Vendure augments these classes at runtime, TS sees only the declared shape.
declare module "@vendure/core/dist/entity/custom-entity-fields" {
  interface CustomChannelFields {
    orderEmailFrom: string | null;
    shopOwnerEmail: string | null;
  }
}

import "@vendure/core/dist/entity/custom-entity-fields.js";
