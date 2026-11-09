import { VendureEvent } from "@vendure/core";
import type { RequestContext } from "@vendure/core";

export interface AuditActor {
  id: number;
  identifier: string;
}

export type AuditEntityType = "material" | "product-definition" | "product" | "promotion";

export type AuditAction = "created" | "updated" | "deleted" | "synced" | "sync-failed";

export type AuditSource = "admin" | "sync" | "system";

export interface AuditEntryInput {
  entityType: AuditEntityType;
  entityKey: string;
  action: AuditAction;
  summary: string | null;
  source: AuditSource;
  actor: AuditActor | null;
}

/** Published by write sites the stock events do not cover (ADR 0015). */
export class AuditEntryEvent extends VendureEvent {
  constructor(
    readonly ctx: RequestContext,
    readonly entry: AuditEntryInput
  ) {
    super();
  }
}

/** The sliver of RequestContext the actor is read from. */
export interface ActorContext {
  session?: { user?: { id: unknown; identifier: string } } | undefined;
}

/** The acting admin on a context, when the request carries a user session. */
export function auditActor(ctx: ActorContext): AuditActor | null {
  const user = ctx.session?.user;
  const id = Number(user?.id);

  if (user === undefined || !Number.isInteger(id)) {
    return null;
  }

  return { id, identifier: user.identifier };
}
