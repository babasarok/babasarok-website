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
 * The lists are stock DataTables: below 640px of table width the patched
 * DataTable molecule renders the rows as cards (ADR 0013), and the page
 * ships no table CSS of its own.
 */
import { useCallback, useEffect, useState, type ReactElement } from "react";
import {
  api,
  Button,
  DataTable,
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
  id: string;
  entityType: string;
  entityKey: string;
  entityLabel: string;
  field: string;
  fieldLabel: string;
  huValue: string;
}

interface DriftRow {
  id: string;
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
      {/* PageLayout renders only its direct PageBlock children (they are
       * recognized by their column/blockId props) — the data blocks live
       * inside them. */}
      <PageLayout>
        <PageBlock column="main" blockId="translation-gaps" title="Hiányzó angol fordítások">
          <GapsBlock entityType={entityType} />
        </PageBlock>
        <PageBlock column="main" blockId="translation-drifts" title="Valószínű elavult fordítások">
          <DriftsBlock entityType={entityType} />
        </PageBlock>
      </PageLayout>
    </Page>
  );
}

function GapsBlock({ entityType }: { entityType: string }): ReactElement {
  const [skip, setSkip] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [rows, setRows] = useState<GapRow[] | null>(null);
  const [totalItems, setTotalItems] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (currentType: string, currentSkip: number, currentSize: number): void => {
      api
        .query(translationGapsQuery, {
          options: {
            skip: currentSkip,
            take: currentSize,
            entityType: currentType === ALL ? null : currentType,
          },
        })
        .then((result) => {
          setRows(
            result.translationGaps.items.map((row) => ({
              ...row,
              id: `${row.entityType}.${row.entityKey}.${row.field}`,
            }))
          );
          setTotalItems(result.translationGaps.totalItems);
          setError(null);
        })
        .catch((err: unknown) => {
          setError(String(err));
        });
    },
    []
  );

  useEffect(() => {
    setSkip(0);
  }, [entityType]);

  useEffect(() => {
    load(entityType, skip, pageSize);
  }, [entityType, skip, pageSize, load]);

  return (
    <>
      {error !== null && <ErrorNotice message={error} />}
      {/* The columns array lives inline so the DataTable's prop type provides
       * the tanstack ColumnDef types without importing from
       * @tanstack/react-table (a transitive dep CI cannot resolve). */}
      <DataTable
        columns={[
          {
            id: "name",
            accessorKey: "entityLabel",
            header: "Név",
            enableSorting: false,
            cell: ({ row }) => <span className="font-medium">{row.original.entityLabel}</span>,
          },
          {
            id: "entityType",
            header: "Entitás",
            enableSorting: false,
            cell: ({ row }) => ENTITY_LABELS[row.original.entityType] ?? row.original.entityType,
          },
          {
            id: "field",
            accessorKey: "fieldLabel",
            header: "Mező",
            enableSorting: false,
            cell: ({ row }) => <span className="font-mono text-xs">{row.original.fieldLabel}</span>,
          },
          {
            id: "hu",
            accessorKey: "huValue",
            header: "Magyar szöveg",
            enableSorting: false,
            cell: ({ row }) => (
              <div className="max-w-60 truncate" title={row.original.huValue}>
                {row.original.huValue}
              </div>
            ),
          },
          {
            id: "fix",
            header: "Angol fordítás",
            enableSorting: false,
            cell: ({ row }) => (
              <FixCell
                multiline={
                  row.original.huValue.length > 60 || row.original.field.endsWith("description")
                }
                onCommit={async (value) => {
                  await api.query(setTranslationMutation, {
                    input: {
                      entityType: row.original.entityType,
                      entityKey: row.original.entityKey,
                      field: row.original.field,
                      languageCode: "en",
                      value,
                      expectedHu: row.original.huValue,
                    },
                  });
                  load(entityType, skip, pageSize);
                }}
              />
            ),
          },
        ]}
        data={rows ?? []}
        totalItems={totalItems}
        isLoading={rows === null}
        page={Math.floor(skip / pageSize) + 1}
        itemsPerPage={pageSize}
        setTableOptions={(options) => ({ ...options, enableSorting: false })}
        onPageChange={(_, newPage, newPageSize) => {
          setPageSize(newPageSize);
          setSkip((newPage - 1) * newPageSize);
        }}
      />
    </>
  );
}

function DriftsBlock({ entityType }: { entityType: string }): ReactElement {
  const [skip, setSkip] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [rows, setRows] = useState<DriftRow[] | null>(null);
  const [totalItems, setTotalItems] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (currentType: string, currentSkip: number, currentSize: number): void => {
      api
        .query(translationDriftsQuery, {
          options: {
            skip: currentSkip,
            take: currentSize,
            entityType: currentType === ALL ? null : currentType,
          },
        })
        .then((result) => {
          setRows(
            result.translationDrifts.items.map((row) => ({
              ...row,
              id: `${row.entityType}.${row.entityKey}.${row.field}.${row.languageCode}`,
            }))
          );
          setTotalItems(result.translationDrifts.totalItems);
          setError(null);
        })
        .catch((err: unknown) => {
          setError(String(err));
        });
    },
    []
  );

  useEffect(() => {
    setSkip(0);
  }, [entityType]);

  useEffect(() => {
    load(entityType, skip, pageSize);
  }, [entityType, skip, pageSize, load]);

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
    load(entityType, skip, pageSize);
  }

  return (
    <>
      {error !== null && <ErrorNotice message={error} />}
      <DataTable
        columns={[
          {
            id: "name",
            accessorKey: "entityLabel",
            header: "Név",
            enableSorting: false,
            cell: ({ row }) => (
              <span className="font-medium">
                {row.original.entityLabel ?? row.original.entityKey}
              </span>
            ),
          },
          {
            id: "entityType",
            header: "Entitás",
            enableSorting: false,
            cell: ({ row }) => ENTITY_LABELS[row.original.entityType] ?? row.original.entityType,
          },
          {
            id: "field",
            accessorKey: "fieldLabel",
            header: "Mező",
            enableSorting: false,
            cell: ({ row }) => <span className="font-mono text-xs">{row.original.fieldLabel}</span>,
          },
          {
            id: "hu",
            header: "Magyar változás",
            enableSorting: false,
            cell: ({ row }) => (
              <div className="max-w-60">
                <div
                  className="truncate"
                  title={`${row.original.huFrom ?? "—"} → ${row.original.huTo}`}
                >
                  {row.original.huFrom ?? "—"} → {row.original.huTo}
                </div>
                <div className="text-muted-foreground text-xs">
                  {new Date(row.original.lastHuChangeAt).toLocaleString("hu-HU")}
                </div>
              </div>
            ),
          },
          {
            id: "fix",
            header: "Fordítás javítása",
            enableSorting: false,
            cell: ({ row }) => (
              <FixCell
                multiline={
                  (row.original.translatedValue?.length ?? 0) > 60 ||
                  row.original.field.endsWith("description")
                }
                initialValue={row.original.translatedValue ?? ""}
                onCommit={async (value) => {
                  await api.query(setTranslationMutation, {
                    input: {
                      entityType: row.original.entityType,
                      entityKey: row.original.entityKey,
                      field: row.original.field,
                      languageCode: row.original.languageCode,
                      value,
                    },
                  });
                  load(entityType, skip, pageSize);
                }}
              />
            ),
          },
          {
            id: "dismiss",
            header: "Álriasztás",
            enableSorting: false,
            cell: ({ row }) => (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void dismiss(row.original);
                }}
              >
                Álriasztás
              </Button>
            ),
          },
        ]}
        data={rows ?? []}
        totalItems={totalItems}
        isLoading={rows === null}
        page={Math.floor(skip / pageSize) + 1}
        itemsPerPage={pageSize}
        setTableOptions={(options) => ({ ...options, enableSorting: false })}
        onPageChange={(_, newPage, newPageSize) => {
          setPageSize(newPageSize);
          setSkip((newPage - 1) * newPageSize);
        }}
      />
    </>
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
    <div className="flex w-64 max-w-full flex-col gap-1.5">
      {multiline === true ? (
        <textarea
          className="min-h-16 w-full min-w-0 rounded border px-2 py-1 text-sm"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
          }}
        />
      ) : (
        <Input
          className="w-full min-w-0"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
          }}
        />
      )}
      <Button
        variant="outline"
        size="sm"
        className="self-end"
        disabled={saving || value.trim() === ""}
        onClick={() => {
          void commit();
        }}
      >
        Mentés
      </Button>
      {error !== null && <div className="text-destructive text-xs">{error}</div>}
    </div>
  );
}
