import type { RequestContext, TransactionalConnection } from "@vendure/core";
import { Material } from "./material.entity";

const MATERIAL_LOCK_NAMESPACE = 1;

export function lockOrder(slugs: Iterable<string>): string[] {
  return [...new Set(slugs)].toSorted();
}

/**
 * Transaction-scoped advisory locks per material slug, taken in sorted order.
 * Definition saves hold them shared (they do not block each other); a material
 * delete holds one exclusive, so it waits for in-flight saves and later saves
 * see the deletion. Must run inside `ctx`'s transaction, before the reads it guards.
 */
export async function lockMaterials(
  connection: TransactionalConnection,
  ctx: RequestContext,
  slugs: Iterable<string>,
  mode: "shared" | "exclusive"
): Promise<void> {
  const repo = connection.getRepository(ctx, Material);
  const fn = mode === "shared" ? "pg_advisory_xact_lock_shared" : "pg_advisory_xact_lock";

  for (const slug of lockOrder(slugs)) {
    await repo.query(`SELECT ${fn}($1, hashtext($2))`, [MATERIAL_LOCK_NAMESPACE, slug]);
  }
}
