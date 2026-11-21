/** The audit row the heuristic reads. */
export interface AuditRowInput {
  id: number;
  entityType: string;
  entityKey: string;
  action: string;
  summary: string | null;
  createdAt: string;
  details: ReadonlyArray<{ field: string; from: string | null; to: string | null }> | null;
}

export interface DriftFinding {
  entityType: string;
  entityKey: string;
  entityLabel: string | null;
  field: string;
  fieldLabel: string;
  languageCode: string;
  huFrom: string | null;
  huTo: string;
  translatedValue: string | null;
  lastHuChangeAt: string;
  auditEntryId: number;
}

interface LanguageChange {
  auditEntryId: number;
  from: string | null;
  to: string | null;
  createdAt: string;
  fieldLabel: string;
}

interface ParsedDetail {
  language: string;
  field: string;
  fieldLabel: string;
}

const LANGUAGE_SUFFIX = / \(([a-z]{2,3}(?:_[A-Za-z]+)?)\)$/u;

/** The audited field labels map to the same field keys the gap scan uses, so
 * one fix mutation serves both. Unmapped labels (prices, slugs, appearance,
 * whole-array suggestion diffs, sync rows) carry no per-language catalog
 * text. */
const PRODUCT_DETAIL_FIELDS: Record<string, string | null | undefined> = {
  Név: "name",
  Leírás: "description",
  "Rövid leírás": "shortDescription",
  Alcím: "tagline",
  Webcím: null,
};

const MATERIAL_DETAIL_FIELDS: Record<string, string | null | undefined> = {
  Név: "label",
  Alcím: "subtitle",
  Leírás: "description",
};

const DEFINITION_DETAIL_FIELDS: Record<string, string | null | undefined> = {
  Címke: "label",
  Súgó: "tooltip",
  Helyőrző: "placeholder",
};

/** Per-entity warnings derived from the audit log: for each audited entity
 * (product, material, product definition, set promotion) and translated
 * field, when the Hungarian value's last audited change is newer than the
 * translation's last recorded change, the translation is presumed stale.
 * Rows without change details, `created`/`synced`/`deleted` rows and saves
 * that touched both languages in one go produce no drift. When the new
 * Hungarian text equals the recorded translation, the pair is identical and
 * not reported. The audit values are display-ready and truncated, so the
 * equality check compares those truncated forms. */
export function translationDrifts(rows: ReadonlyArray<AuditRowInput>): DriftFinding[] {
  const changes = new Map<string, Map<string, LanguageChange>>();
  const labels = new Map<string, { id: number; summary: string }>();

  for (const row of rows) {
    if (row.action !== "updated" || row.details === null) {
      continue;
    }

    const entity = `${row.entityType}|${row.entityKey}`;
    const known = labels.get(entity);

    if (row.summary !== null && (known === undefined || known.id < row.id)) {
      labels.set(entity, { id: row.id, summary: row.summary });
    }

    for (const detail of row.details) {
      const parsed = parseDetail(row.entityType, detail.field);

      if (parsed === null) {
        continue;
      }

      const fieldKey = `${entity}|${parsed.field}`;
      const perLanguage = changes.get(fieldKey) ?? new Map<string, LanguageChange>();

      perLanguage.set(parsed.language, {
        auditEntryId: row.id,
        from: detail.from,
        to: detail.to,
        createdAt: row.createdAt,
        fieldLabel: parsed.fieldLabel,
      });
      changes.set(fieldKey, perLanguage);
    }
  }

  const findings: DriftFinding[] = [];

  for (const [fieldKey, perLanguage] of changes) {
    const hu = perLanguage.get("hu");

    if (hu === undefined) {
      continue;
    }

    const [entityType, entityKey, field] = fieldKey.split("|");

    for (const [language, change] of perLanguage) {
      if (language === "hu" || change.auditEntryId >= hu.auditEntryId) {
        continue;
      }

      if (!valuesDiffer(hu.to, change.to)) {
        continue;
      }

      const label = labels.get(`${entityType}|${entityKey}`);

      findings.push({
        entityType,
        entityKey,
        entityLabel: label?.summary ?? null,
        field,
        fieldLabel: hu.fieldLabel,
        languageCode: language,
        huFrom: hu.from,
        huTo: hu.to ?? "",
        translatedValue: change.to,
        lastHuChangeAt: hu.createdAt,
        auditEntryId: hu.auditEntryId,
      });
    }
  }

  return findings.toSorted(byEntityTypeThenLabelThenField);
}

const ENTITY_ORDER: Record<string, number> = {
  product: 0,
  material: 1,
  "product-definition": 2,
  promotion: 3,
};

function byEntityTypeThenLabelThenField(a: DriftFinding, b: DriftFinding): number {
  return (
    (ENTITY_ORDER[a.entityType] ?? Number.MAX_SAFE_INTEGER) -
      (ENTITY_ORDER[b.entityType] ?? Number.MAX_SAFE_INTEGER) ||
    (a.entityLabel ?? "").localeCompare(b.entityLabel ?? "", "hu") ||
    a.field.localeCompare(b.field)
  );
}

/** The Hungarian texts count as identical when both recorded (truncated)
 * values match; trim guards whitespace-only edits. A removed Hungarian value
 * (`to: null`) always counts as drifted. */
function valuesDiffer(huTo: string | null, translatedTo: string | null): boolean {
  if (huTo === null) {
    return true;
  }

  return huTo.trim() !== (translatedTo ?? "").trim();
}

const LANGUAGE_KEY = /^[a-z]{2,3}(?:_[A-Za-z]+)?$/u;

/** Maps one audit detail label to its language and canonical field, or null
 * when the label carries no per-language catalog text. Product labels carry
 * the language as their middle segment (`Fordítás / hu / Név`); the other
 * entities suffix it (`Név (hu)`). */
export function parseDetail(entityType: string, label: string): ParsedDetail | null {
  if (entityType === "promotion") {
    return label === "Név" ? { language: "hu", field: "name", fieldLabel: "Név" } : null;
  }

  const segments = label.split(" / ");
  const last = segments.at(-1) ?? "";
  const match = LANGUAGE_SUFFIX.exec(last);

  if (entityType === "product") {
    if (segments.length !== 3 || segments[0] !== "Fordítás" || !LANGUAGE_KEY.test(segments[1])) {
      return null;
    }

    const field = PRODUCT_DETAIL_FIELDS[segments[2]];

    return field === null || field === undefined
      ? null
      : { language: segments[1], field, fieldLabel: segments[2] };
  }

  if (match === null) {
    return null;
  }

  const language = match[1];
  const bare = last.slice(0, match.index);

  if (entityType === "material") {
    if (segments.length === 1) {
      const field = MATERIAL_DETAIL_FIELDS[bare];

      return field === null || field === undefined ? null : { language, field, fieldLabel: bare };
    }

    if (segments.length === 3 && segments[0] === "Színek/minták") {
      return {
        language,
        field: `colors.${segments[1]}.label`,
        fieldLabel: `Szín neve (${segments[1]})`,
      };
    }

    return null;
  }

  if (entityType === "product-definition") {
    if (segments[0] !== "Mezők") {
      return null;
    }

    if (segments.length === 3) {
      const field = DEFINITION_DETAIL_FIELDS[bare];

      return field === null || field === undefined
        ? null
        : {
            language,
            field: `fields.${segments[1]}.${field}`,
            fieldLabel: "Definíció szöveg",
          };
    }

    if (segments.length === 5 && segments[2] === "Opciók" && bare === "Címke") {
      return {
        language,
        field: `fields.${segments[1]}.options.${segments[3]}.label`,
        fieldLabel: "Definíció szöveg",
      };
    }

    return null;
  }

  return null;
}
