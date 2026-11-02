import type { ProductField } from "@babasarok/product-definition";

/**
 * Fields in dependency order (each `visibility` target before its dependents),
 * plus the ids caught in a dependency cycle. Cyclic fields are unreachable in
 * the order form — none of them can be the first selection — so they are
 * treated as permanently hidden.
 */
export function dependencyOrder(fields: readonly ProductField[]): {
  order: ProductField[];
  cyclic: Set<string>;
} {
  const byId = new Map<ProductField["id"], ProductField>(fields.map((field) => [field.id, field]));
  const indegree = new Map<ProductField["id"], number>();
  const dependents = new Map<ProductField["id"], ProductField["id"][]>();

  for (const field of fields) {
    indegree.set(field.id, 0);
  }

  for (const field of fields) {
    if (field.kind === "material" || field.visibility.kind === "always") {
      continue;
    }

    const targetId = field.visibility.fieldId;

    if (targetId !== field.id && byId.has(targetId)) {
      indegree.set(field.id, (indegree.get(field.id) ?? 0) + 1);
      dependents.set(targetId, [...(dependents.get(targetId) ?? []), field.id]);
    }
  }

  const queue: ProductField["id"][] = fields
    .filter((field) => (indegree.get(field.id) ?? 0) === 0)
    .map((field) => field.id);
  const orderedIds: ProductField["id"][] = [];

  for (let at = 0; at < queue.length; at += 1) {
    const id = queue[at];

    orderedIds.push(id);

    for (const dependent of dependents.get(id) ?? []) {
      const left = (indegree.get(dependent) ?? 1) - 1;

      indegree.set(dependent, left);

      if (left === 0) {
        queue.push(dependent);
      }
    }
  }

  const ordered = new Set(orderedIds);
  const order: ProductField[] = [];

  for (const id of orderedIds) {
    const field = byId.get(id);

    if (field !== undefined) {
      order.push(field);
    }
  }

  return {
    order,
    cyclic: new Set(fields.map((field) => field.id).filter((id) => !ordered.has(id))),
  };
}

export function isVisible(
  field: ProductField,
  cyclic: ReadonlySet<string>,
  knownFieldIds: ReadonlySet<string>,
  values: ReadonlyMap<string, string | boolean>
): boolean {
  if (field.kind === "material" || field.visibility.kind === "always") {
    return true;
  }

  if (cyclic.has(field.id)) {
    return false;
  }

  if (!knownFieldIds.has(field.visibility.fieldId)) {
    return true;
  }

  const target = values.get(field.visibility.fieldId);

  if (field.visibility.kind === "when-present") {
    return typeof target === "string" || target === true;
  }

  const required = field.visibility.value;

  if (typeof target === "string") {
    return typeof required === "string" && target === required;
  }

  if (typeof target === "boolean") {
    return typeof required === "boolean" ? target === required : String(target) === required;
  }

  return false;
}
