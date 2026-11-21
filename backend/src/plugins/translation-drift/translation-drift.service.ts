import { Injectable } from "@nestjs/common";
import { RequestContext, TransactionalConnection, UserInputError } from "@vendure/core";
import { In, IsNull, Not } from "typeorm";
import { auditActor } from "../audit/audit.event";
import { AuditLogEntry } from "../audit/audit.entity";
import { translationDrifts, type DriftFinding } from "./drift";
import { TranslationDriftDismissal } from "./translation-drift.entity";

export interface TranslationDriftOptions {
  skip?: number | null;
  take?: number | null;
  entityType?: string | null;
}

export interface TranslationDriftList {
  items: DriftFinding[];
  totalItems: number;
}

export interface DismissTranslationDriftInput {
  entityType: string;
  entityKey: string;
  field: string;
  languageCode: string;
  auditEntryId: string;
}

/** The entity types whose audit rows carry per-language text changes. */
const AUDITED_ENTITIES = ["product", "material", "product-definition", "promotion"];

@Injectable()
export class TranslationDriftService {
  constructor(private connection: TransactionalConnection) {}

  async drifts(options: TranslationDriftOptions | null): Promise<TranslationDriftList> {
    const rows = await this.connection.rawConnection.getRepository(AuditLogEntry).find({
      where: { action: "updated", entityType: In(AUDITED_ENTITIES), details: Not(IsNull()) },
      order: { id: "ASC" },
    });

    const findings = translationDrifts(
      rows.map((row) => ({
        id: Number(row.id),
        entityType: row.entityType,
        entityKey: row.entityKey,
        action: row.action,
        summary: row.summary,
        createdAt: row.createdAt.toISOString(),
        details: row.details,
      }))
    );

    const dismissals = await this.connection.rawConnection
      .getRepository(TranslationDriftDismissal)
      .find();
    const dismissedAt = new Map(
      dismissals.map((dismissal) => [
        `${dismissal.entityType}|${dismissal.entityKey}|${dismissal.field}|${dismissal.languageCode}`,
        dismissal.auditEntryId,
      ])
    );

    const visible = findings.filter(
      (finding) =>
        finding.auditEntryId > (dismissedAt.get(dismissalKey(finding)) ?? Number.NEGATIVE_INFINITY)
    );
    const filtered =
      typeof options?.entityType === "string" && options.entityType !== ""
        ? visible.filter((finding) => finding.entityType === options.entityType)
        : visible;
    const skip = Math.max(options?.skip ?? 0, 0);
    const take = Math.min(Math.max(options?.take ?? 50, 1), 100);

    return { items: filtered.slice(skip, skip + take), totalItems: filtered.length };
  }

  /** Records the dismissal against the audit entry that triggered the
   * warning; a newer Hungarian change re-raises it. */
  async dismiss(ctx: RequestContext, input: DismissTranslationDriftInput): Promise<boolean> {
    const auditEntryId = Number(input.auditEntryId);

    if (!Number.isInteger(auditEntryId) || auditEntryId <= 0) {
      throw new UserInputError(`Érvénytelen változásnapló-bejegyzés: ${input.auditEntryId}`);
    }

    const repo = this.connection.rawConnection.getRepository(TranslationDriftDismissal);
    const where = {
      entityType: input.entityType,
      entityKey: input.entityKey,
      field: input.field,
      languageCode: input.languageCode,
    };
    const actor = auditActor(ctx);
    const actorIdentifier = actor === null ? null : actor.identifier;

    if ((await repo.findOneBy(where)) === null) {
      await repo.insert({ ...where, auditEntryId, actorIdentifier });
    } else {
      await repo.update(where, { auditEntryId, actorIdentifier });
    }

    return true;
  }
}

function dismissalKey(finding: DriftFinding): string {
  return `${finding.entityType}|${finding.entityKey}|${finding.field}|${finding.languageCode}`;
}
