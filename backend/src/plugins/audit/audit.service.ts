import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import {
  EventBus,
  LanguageCode,
  Logger,
  ProductEvent,
  TransactionalConnection,
} from "@vendure/core";
import { Between, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual } from "typeorm";
import { ActorContext, AuditEntryEvent, AuditEntryInput, auditActor } from "./audit.event";
import { AuditLogEntry } from "./audit.entity";

export interface AuditLogListOptions {
  skip?: number | null;
  take?: number | null;
  entityType?: string | null;
  source?: string | null;
  from?: Date | null;
  to?: Date | null;
}

export interface AuditLogList {
  items: AuditLogEntry[];
  totalItems: number;
}

/** The audit row a native product event maps to. Updates are not mapped here:
 * the ProductAuditInterceptor owns them, since only it has the before state
 * for the field-level details. */
export function productEntry(event: {
  ctx: ActorContext;
  type: "created" | "deleted";
  entity: {
    id: unknown;
    translations?: ReadonlyArray<{ languageCode: LanguageCode; name: string }> | null;
  };
}): AuditEntryInput {
  const actor = auditActor(event.ctx);
  const huName = event.entity.translations?.find(
    (translation) => translation.languageCode === LanguageCode.hu
  )?.name;

  return {
    entityType: "product",
    entityKey: String(event.entity.id),
    action: event.type,
    summary: typeof huName === "string" && huName !== "" ? huName : null,
    details: null,
    source: actor === null ? "system" : "admin",
    actor,
  };
}

/** Updates are audited by the interceptor (which has the before state). */
function isLifecycleEvent(
  event: ProductEvent
): event is ProductEvent & { type: "created" | "deleted" } {
  return event.type !== "updated";
}

@Injectable()
export class AuditService implements OnApplicationBootstrap {
  constructor(
    private eventBus: EventBus,
    private connection: TransactionalConnection
  ) {}

  onApplicationBootstrap(): void {
    this.eventBus.ofType(AuditEntryEvent).subscribe((event) => {
      void this.record(event.entry);
    });
    this.eventBus.ofType(ProductEvent).subscribe((event) => {
      if (!isLifecycleEvent(event)) {
        return;
      }

      void this.record(productEntry(event));
    });
  }

  /** A failed log write must never fail the business write it observes. */
  async record(entry: AuditEntryInput): Promise<void> {
    try {
      await this.connection.rawConnection.getRepository(AuditLogEntry).insert({
        entityType: entry.entityType,
        entityKey: entry.entityKey,
        action: entry.action,
        summary: entry.summary,
        details: entry.details,
        source: entry.source,
        actorUserId: entry.actor?.id ?? null,
        actorIdentifier: entry.actor?.identifier ?? null,
      });
    } catch (error: unknown) {
      Logger.error(
        `A változásnapló bejegyzés írása sikertelen (${entry.entityType} ${entry.entityKey}): ` +
          (error instanceof Error ? error.message : String(error))
      );
    }
  }

  async entries(options: AuditLogListOptions | null): Promise<AuditLogList> {
    const where: FindOptionsWhere<AuditLogEntry> = {};

    if (typeof options?.entityType === "string" && options.entityType !== "") {
      where.entityType = options.entityType;
    }

    if (typeof options?.source === "string" && options.source !== "") {
      where.source = options.source;
    }

    const from = options?.from ?? null;
    const to = options?.to ?? null;

    if (from !== null && to !== null) {
      where.createdAt = Between(from, to);
    } else if (from !== null) {
      where.createdAt = MoreThanOrEqual(from);
    } else if (to !== null) {
      where.createdAt = LessThanOrEqual(to);
    }

    const skip = Math.max(options?.skip ?? 0, 0);
    const take = Math.min(Math.max(options?.take ?? 50, 1), 100);
    const [items, totalItems] = await this.connection.rawConnection
      .getRepository(AuditLogEntry)
      .findAndCount({ where, order: { createdAt: "DESC" }, skip, take });

    return { items, totalItems };
  }
}
