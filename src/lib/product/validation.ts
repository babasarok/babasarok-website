import { bannedCombinationIds } from "./materials";
import type { IProduct } from "../types.svelte";
import { isFieldVisible } from "./field";
import { FIELD_BEHAVIORS } from "./behavior";

export function sanitizeItem(item: IProduct): IProduct {
  // Prefill fields with default values and clamp overreaching ones, to make
  // sure validation and price calculation always see a complete item.
  const ctx = { fields: item.fields };
  for (const field of item.fields) {
    FIELD_BEHAVIORS[field.type].normalize(field, ctx);
  }
  return item;
}

export function validateItem(item: IProduct): IProduct {
  // The banned-combination rule spans all material fields, so resolve the
  // product's banned id multisets once instead of per field.
  const ctx = { fields: item.fields, banned: bannedCombinationIds(item) };
  for (const field of item.fields) {
    // Hidden dependent fields must not block submission; clear any stale error.
    if (!isFieldVisible(field, item.fields)) {
      FIELD_BEHAVIORS[field.type].clearErrors(field);
      continue;
    }
    FIELD_BEHAVIORS[field.type].validate(field, ctx);
  }

  return item;
}

export function isItemValid(item: IProduct): boolean {
  for (const field of item.fields) {
    if (isFieldVisible(field, item.fields) && FIELD_BEHAVIORS[field.type].hasError(field)) {
      return false;
    }
  }

  return true;
}
