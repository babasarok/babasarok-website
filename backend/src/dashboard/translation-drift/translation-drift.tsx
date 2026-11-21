/**
 * Dashboard extension for the TranslationDriftPlugin: a "Fordítások" page
 * under the catalog nav with two blocks — catalog text missing its English
 * translation (each fixable inline), and audit-derived warnings that a
 * translation drifted from its changed Hungarian source, dismissible as
 * false positives.
 *
 * Type-checked by src/dashboard/tsconfig.json (`check:dashboard` runs it);
 * at build time the dashboard's vite pipeline bundles this file. The typed
 * graphql documents come from the backend's generated schema (src/gql).
 */
import { useCallback, useEffect, useState, type ReactElement } from "react";
import {
  api,
  defineDashboardExtension,
  Input,
  Page,
  PageActionBar,
  PageBlock,
  PageLayout,
  PageTitle,
} from "@vendure/dashboard";
import { graphql } from "@/gql";
import { ALL, ErrorNotice, FilterSelect } from "../shared";

const PAGE_SIZE = 50;

const translationGapsQuery = graphql(`
  query TranslationGaps($options: TranslationGapOptions) {
    translationGaps(options: $options) {
      totalItems
      items {
        entityType
        entityKey
        entityLabel
        field
        fieldLabel
        huValue
      }
    }
  }
`);

const translationDriftsQuery = graphql(`
  query TranslationDrifts($options: TranslationDriftOptions) {
    translationDrifts(options: $options) {
      totalItems
      items {
        entityType
        entityKey
        entityLabel
        field
        fieldLabel
        languageCode
        huFrom
        huTo
        translatedValue
        lastHuChangeAt
        auditEntryId
      }
    }
  }
`);

const setTranslationMutation = graphql(`
  mutation SetTranslation($input: SetTranslationInput!) {
    setTranslation(input: $input)
  }
`);

const dismissTranslationDriftMutation = graphql(`
  mutation DismissTranslationDrift($input: DismissTranslationDriftInput!) {
    dismissTranslationDrift(input: $input)
  }
`);

interface GapRow {
  entityType: string;
  entityKey: string;
  entityLabel: string;
  field: string;
  fieldLabel: string;
  huValue: string;
}

interface DriftRow {
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
  auditEntryId: string;
}

const ENTITY_TYPES: Array<{ value: string; label: string }> = [
  { value: ALL, label: "Minden entitás" },
  { value: "product", label: "Termék" },
  { value: "material", label: "Anyag" },
  { value: "product-definition", label: "Termékdefiníció" },
  { value: "shipping-method", label: "Szállítási mód" },
  { value: "promotion", label: "Kedvezmény" },
  { value: "collection", label: "Gyűjtemény" },
  { value: "facet", label: "Tulajdonság" },
  { value: "facet-value", label: "Tulajdonságérték" },
];

const ENTITY_LABELS: Record<string, string> = Object.fromEntries(
  ENTITY_TYPES.filter((option) => option.value !== ALL).map((option) => [
    option.value,
    option.label,
  ])
);

// Extensions load for side effects only (the dashboard's virtual module
// dynamic-imports this file); the registration call must run on import.
defineDashboardExtension({
  routes: [
    {
      path: "/translation-drift",
      component: () => <TranslationDriftPage />,
      navMenuItem: { sectionId: "catalog", title: "Fordítások" },
    },
  ],
});

function TranslationDriftPage(): ReactElement {
  const [entityType, setEntityType] = useState(ALL);

  return (
    <Page pageId="translation-drift">
      <PageTitle>Fordítások</PageTitle>
      <PageActionBar>
        <FilterSelect
          value={entityType}
          items={Object.fromEntries(ENTITY_TYPES.map((option) => [option.value, option.label]))}
          onChange={(value) => {
            setEntityType(value);
          }}
        />
      </PageActionBar>
      <PageLayout>
        <GapsBlock entityType={entityType} />
        <DriftsBlock entityType={entityType} />
      </PageLayout>
    </Page>
  );
}

function GapsBlock({ entityType }: { entityType: string }): ReactElement {
  const [skip, setSkip] = useState(0);
  const [rows, setRows] = useState<GapRow[] | null>(null);
  const [totalItems, setTotalItems] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((currentType: string, currentSkip: number): void => {
    api
      .query(translationGapsQuery, {
        options: {
          skip: currentSkip,
          take: PAGE_SIZE,
          entityType: currentType === ALL ? null : currentType,
        },
      })
      .then((result) => {
        setRows(result.translationGaps.items);
        setTotalItems(result.translationGaps.totalItems);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(String(err));
      });
  }, []);

  useEffect(() => {
    setSkip(0);
    load(entityType, 0);
  }, [entityType, load]);

  return (
    <PageBlock column="main" blockId="translation-gaps" title="Hiányzó angol fordítások">
      {error !== null && <ErrorNotice message={error} />}
      {rows !== null && rows.length === 0 && <p>Minden fordítás megvan.</p>}
      {rows !== null && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-2 pr-4 font-medium">Entitás</th>
                <th className="py-2 pr-4 font-medium">Név</th>
                <th className="py-2 pr-4 font-medium">Mező</th>
                <th className="py-2 pr-4 font-medium">Magyar szöveg</th>
                <th className="py-2 pr-4 font-medium">Angol fordítás</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.entityType}.${row.entityKey}.${row.field}`} className="border-b">
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {ENTITY_LABELS[row.entityType] ?? row.entityType}
                  </td>
                  <td className="py-2 pr-4">{row.entityLabel}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{row.fieldLabel}</td>
                  <td className="py-2 pr-4">
                    <div className="max-w-120 truncate" title={row.huValue}>
                      {row.huValue}
                    </div>
                  </td>
                  <td className="py-2 pr-4">
                    <FixCell
                      multiline={row.huValue.length > 60 || row.field.endsWith("description")}
                      onCommit={async (value) => {
                        await api.query(setTranslationMutation, {
                          input: {
                            entityType: row.entityType,
                            entityKey: row.entityKey,
                            field: row.field,
                            languageCode: "en",
                            value,
                            expectedHu: row.huValue,
                          },
                        });
                        load(entityType, skip);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager skip={skip} setSkip={setSkip} totalItems={totalItems} />
    </PageBlock>
  );
}

function DriftsBlock({ entityType }: { entityType: string }): ReactElement {
  const [skip, setSkip] = useState(0);
  const [rows, setRows] = useState<DriftRow[] | null>(null);
  const [totalItems, setTotalItems] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((currentType: string, currentSkip: number): void => {
    api
      .query(translationDriftsQuery, {
        options: {
          skip: currentSkip,
          take: PAGE_SIZE,
          entityType: currentType === ALL ? null : currentType,
        },
      })
      .then((result) => {
        setRows(result.translationDrifts.items);
        setTotalItems(result.translationDrifts.totalItems);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(String(err));
      });
  }, []);

  useEffect(() => {
    setSkip(0);
    load(entityType, 0);
  }, [entityType, load]);

  async function dismiss(row: DriftRow): Promise<void> {
    await api.query(dismissTranslationDriftMutation, {
      input: {
        entityType: row.entityType,
        entityKey: row.entityKey,
        field: row.field,
        languageCode: row.languageCode,
        auditEntryId: row.auditEntryId,
      },
    });
    load(entityType, skip);
  }

  return (
    <PageBlock column="main" blockId="translation-drifts" title="Valószínű elavult fordítások">
      {error !== null && <ErrorNotice message={error} />}
      {rows !== null && rows.length === 0 && <p>Nincs elavult fordítás.</p>}
      {rows !== null && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="py-2 pr-4 font-medium">Entitás</th>
                <th className="py-2 pr-4 font-medium">Név</th>
                <th className="py-2 pr-4 font-medium">Mező</th>
                <th className="py-2 pr-4 font-medium">Magyar változás</th>
                <th className="py-2 pr-4 font-medium">Fordítás javítása</th>
                <th className="py-2 pr-4 font-medium">Álriasztás</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.entityType}.${row.entityKey}.${row.field}`} className="border-b">
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {ENTITY_LABELS[row.entityType] ?? row.entityType}
                  </td>
                  <td className="py-2 pr-4">{row.entityLabel ?? row.entityKey}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{row.fieldLabel}</td>
                  <td className="py-2 pr-4">
                    <div className="max-w-120">
                      {row.huFrom ?? "—"} → {row.huTo}
                    </div>
                    <div className="text-muted-foreground text-xs">
                      {new Date(row.lastHuChangeAt).toLocaleString("hu-HU")}
                    </div>
                  </td>
                  <td className="py-2 pr-4">
                    <FixCell
                      multiline={
                        (row.translatedValue?.length ?? 0) > 60 || row.field.endsWith("description")
                      }
                      initialValue={row.translatedValue ?? ""}
                      onCommit={async (value) => {
                        await api.query(setTranslationMutation, {
                          input: {
                            entityType: row.entityType,
                            entityKey: row.entityKey,
                            field: row.field,
                            languageCode: row.languageCode,
                            value,
                          },
                        });
                        load(entityType, skip);
                      }}
                    />
                  </td>
                  <td className="py-2 pr-4">
                    <button
                      type="button"
                      className="rounded border px-3 py-1 text-sm"
                      onClick={() => {
                        void dismiss(row);
                      }}
                    >
                      Álriasztás
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager skip={skip} setSkip={setSkip} totalItems={totalItems} />
    </PageBlock>
  );
}

function Pager({
  skip,
  setSkip,
  totalItems,
}: {
  skip: number;
  setSkip: (next: number) => void;
  totalItems: number;
}): ReactElement | null {
  if (totalItems <= PAGE_SIZE) {
    return null;
  }

  return (
    <div className="mt-4 flex items-center gap-2 text-sm">
      <button
        type="button"
        className="rounded border px-3 py-1 disabled:opacity-40"
        disabled={skip === 0}
        onClick={() => {
          setSkip(Math.max(skip - PAGE_SIZE, 0));
        }}
      >
        Előző
      </button>
      <span>
        {skip + 1}–{Math.min(skip + PAGE_SIZE, totalItems)} / {totalItems}
      </span>
      <button
        type="button"
        className="rounded border px-3 py-1 disabled:opacity-40"
        disabled={skip + PAGE_SIZE >= totalItems}
        onClick={() => {
          setSkip(skip + PAGE_SIZE);
        }}
      >
        Következő
      </button>
    </div>
  );
}

function FixCell({
  initialValue,
  multiline,
  onCommit,
}: {
  initialValue?: string;
  multiline?: boolean;
  onCommit: (value: string) => Promise<void>;
}): ReactElement {
  const [value, setValue] = useState(initialValue ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function commit(): Promise<void> {
    setSaving(true);
    setError(null);

    try {
      await onCommit(value);
      setValue("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-120">
      <div className="flex items-start gap-2">
        {multiline === true ? (
          <textarea
            className="min-h-16 flex-1 rounded border px-2 py-1 text-sm"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
            }}
          />
        ) : (
          <Input
            className="flex-1"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
            }}
          />
        )}
        <button
          type="button"
          className="rounded border px-3 py-1 text-sm disabled:opacity-40"
          disabled={saving || value.trim() === ""}
          onClick={() => {
            void commit();
          }}
        >
          Mentés
        </button>
      </div>
      {error !== null && <div className="text-destructive mt-1 text-xs">{error}</div>}
    </div>
  );
}
