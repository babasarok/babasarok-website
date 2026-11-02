/**
 * The native product id a deleted-product event carries, undefined for every
 * other product event (ADR 0011 decision 4: a stock delete of a generated
 * product cascades to its definition).
 */
export function deletedNativeProductId(event: {
  type: unknown;
  entity: { id: unknown };
}): number | undefined {
  if (event.type !== "deleted") {
    return undefined;
  }

  const id = Number(event.entity.id);

  return Number.isInteger(id) ? id : undefined;
}

/**
 * The native product id an updated-product event carries, undefined for every
 * other product event (ADR 0011 decision 1: a stock rename of a generated
 * product re-enqueues its sync so the variant names follow the new name).
 */
export function updatedNativeProductId(event: {
  type: unknown;
  entity: { id: unknown };
}): number | undefined {
  if (event.type !== "updated") {
    return undefined;
  }

  const id = Number(event.entity.id);

  return Number.isInteger(id) ? id : undefined;
}
