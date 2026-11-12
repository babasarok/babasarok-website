// Declaration merging for the custom fields defined in vendure-config.ts:
// Vendure augments these classes at runtime, TS sees only the declared shape.
// Locale-typed custom fields live on the *Translation interfaces.
declare module "@vendure/core/dist/entity/custom-entity-fields" {
  interface CustomChannelFields {
    orderEmailFrom: string | null;
    shopOwnerEmail: string | null;
  }

  interface CustomOrderFields {
    deliveryMethodName: string | null;
    termsAccepted: boolean | null;
    taxNumber: string | null;
  }

  interface CustomShippingMethodFields {
    requiresAddress: boolean;
  }

  interface CustomProductFields {
    date: Date | null;
    icon: Asset | null;
    iconId: number | null;
  }

  interface CustomProductFieldsTranslation {
    shortDescription: string | null;
    tagline: string | null;
  }

  interface CustomFacetValueFields {
    hex: string | null;
    swatch: Asset | null;
    swatchId: number | null;
  }

  interface CustomAssetFieldsTranslation {
    galleryDescription: string | null;
  }

  interface CustomCollectionFields {
    setDiscount: number | null;
  }

  interface CustomOrderLineFields {
    configText?: string | null;
    lengthCm?: number | null;
    selections?: string | null;
  }
}

import "@vendure/core/dist/entity/custom-entity-fields.js";
import type { Asset } from "@vendure/core";
