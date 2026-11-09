import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { EventBus, Logger, ProductEvent, TransactionalConnection } from "@vendure/core";
import { Between, FindOptionsWhere, LessThanOrEqual, MoreThanOrEqual } from "typeorm";
import type { MaterialChangeType } from "../material/material.event";
import { ActorContext, AuditEntryEvent, AuditEntryInput, auditActor } from "./audit.event";
import { AuditLogEntry } from "./audit.entity";
import { MaterialEvent } from "../material/material.event";

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

/** The audit row a MaterialEvent maps to: one row per material write. */
export function materialEntry(event: {
  ctx: ActorContext;
  type: MaterialChangeType;
  materialSlug: string;
}): AuditEntryInput {
  const actor = auditActor(event.ctx);

  return {
    entityType: "material",
    entityKey: event.materialSlug,
    action: event.type,
    summary: null,
    source: actor === null ? "system" : "admin",
    actor,
  };
}

/** The audit row a native product event maps to. */
export function productEntry(event: {
  ctx: ActorContext;
  type: "created" | "updated" | "deleted";
  entity: { id: unknown; name?: unknown };
}): AuditEntryInput {
  const actor = auditActor(event.ctx);

  return {
    entityType: "product",
    entityKey: String(event.entity.id),
    action: event.type,
    summary: typeof event.entity.name === "string" ? event.entity.name : null,
    source: actor === null ? "system" : "admin",
    actor,
  };
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
    this.eventBus.ofType(MaterialEvent).subscribe((event) => {
      void this.record(materialEntry(event));
    });
    this.eventBus.ofType(ProductEvent).subscribe((event) => {
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
