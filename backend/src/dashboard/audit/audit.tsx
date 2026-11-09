/**
 * Dashboard extension for the AuditPlugin: a "Változásnapló" list under the
 * catalog nav showing who changed what and when (ADR 0015). Read-only;
 * filterable by entity type, source and period.
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@vendure/dashboard";
import { graphql } from "@/gql";
import { ErrorNotice } from "../shared";

const PAGE_SIZE = 50;

const auditLogQuery = graphql(`
  query AuditLogEntries($options: AuditLogListOptions) {
    auditLogEntries(options: $options) {
      totalItems
      items {
        id
        createdAt
        action
        source
        entityType
        entityKey
        actorIdentifier
        summary
      }
    }
  }
`);

interface AuditRow {
  id: string;
  createdAt: string;
  action: string;
  source: string;
  entityType: string;
  entityKey: string;
  actorIdentifier: string | null;
  summary: string | null;
}

interface Filters {
  entityType: string;
  source: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = { entityType: "", source: "", from: "", to: "" };

/** The sentinel value the "no filter" option carries. */
const ALL = "all";

const ENTITY_TYPES: Array<{ value: string; label: string }> = [
  { value: ALL, label: "Minden entitás" },
  { value: "material", label: "Anyag" },
  { value: "product-definition", label: "Termékdefiníció" },
  { value: "product", label: "Natív termék" },
  { value: "promotion", label: "Szett-kedvezmény" },
];

const SOURCES: Array<{ value: string; label: string }> = [
  { value: ALL, label: "Minden forrás" },
  { value: "admin", label: "Admin" },
  { value: "sync", label: "Szinkronizálás" },
  { value: "system", label: "Rendszer" },
];

const ACTION_LABELS: Record<string, string> = {
  created: "létrehozva",
  updated: "módosítva",
  deleted: "törölve",
  synced: "szinkronizálva",
  "sync-failed": "szinkronizálás sikertelen",
};

/** Date inputs give local calendar days; the range covers the whole "to" day. */
function optionsFor(
  filters: Filters,
  skip: number
): {
  skip: number;
  take: number;
  entityType: string | null;
  source: string | null;
  from: string | null;
  to: string | null;
} {
  return {
    skip,
    take: PAGE_SIZE,
    entityType: filters.entityType === "" ? null : filters.entityType,
    source: filters.source === "" ? null : filters.source,
    from: filters.from === "" ? null : new Date(`${filters.from}T00:00:00`).toISOString(),
    to: filters.to === "" ? null : new Date(`${filters.to}T23:59:59.999`).toISOString(),
  };
}

function FilterSelect({
  value,
  items,
  onChange,
}: {
  value: string;
  items: Record<string, string>;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <Select
      value={value}
      onValueChange={(next: string | null) => {
        onChange(next ?? ALL);
      }}
      items={items}
    >
      <SelectTrigger className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(items).map(([itemValue, label]) => (
          <SelectItem key={itemValue} value={itemValue}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Extensions load for side effects only (the dashboard's virtual module
// dynamic-imports this file); the registration call must run on import.
defineDashboardExtension({
  routes: [
    {
      path: "/audit-log",
      component: () => <AuditLogPage />,
      navMenuItem: { sectionId: "catalog", title: "Változásnapló" },
    },
  ],
});

function AuditLogPage(): ReactElement {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [skip, setSkip] = useState(0);
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [totalItems, setTotalItems] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((current: Filters, currentSkip: number): void => {
    api
      .query(auditLogQuery, { options: optionsFor(current, currentSkip) })
      .then((result) => {
        setRows(
          result.auditLogEntries.items.map((entry) => ({
            id: entry.id,
            createdAt: entry.createdAt,
            action: entry.action,
            source: entry.source,
            entityType: entry.entityType,
            entityKey: entry.entityKey,
            actorIdentifier: entry.actorIdentifier ?? null,
            summary: entry.summary ?? null,
          }))
        );
        setTotalItems(result.auditLogEntries.totalItems);
        setError(null);
      })
      .catch((err: unknown) => {
        setError(String(err));
      });
  }, []);

  useEffect(() => {
    load(filters, skip);
  }, [filters, skip, load]);

  function setFilter(patch: Partial<Filters>): void {
    setFilters((current) => ({ ...current, ...patch }));
    setSkip(0);
  }

  return (
    <Page pageId="audit-log">
      <PageTitle>Változásnapló</PageTitle>
      <PageActionBar>
        <FilterSelect
          value={filters.entityType === "" ? ALL : filters.entityType}
          items={Object.fromEntries(ENTITY_TYPES.map((option) => [option.value, option.label]))}
          onChange={(value) => {
            setFilter({ entityType: value === ALL ? "" : value });
          }}
        />
        <FilterSelect
          value={filters.source === "" ? ALL : filters.source}
          items={Object.fromEntries(SOURCES.map((option) => [option.value, option.label]))}
          onChange={(value) => {
            setFilter({ source: value === ALL ? "" : value });
          }}
        />
        <Input
          type="date"
          value={filters.from}
          onChange={(e) => {
            setFilter({ from: e.target.value });
          }}
        />
        <Input
          type="date"
          value={filters.to}
          onChange={(e) => {
            setFilter({ to: e.target.value });
          }}
        />
      </PageActionBar>
      <PageLayout>
        <PageBlock column="main" blockId="audit-log" title="Változásnapló">
          {error !== null && <ErrorNotice message={error} />}
          {rows !== null && rows.length === 0 && <p>Nincs rögzített változás.</p>}
          {rows !== null && rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left">
                    <th className="py-2 pr-4 font-medium">Időpont</th>
                    <th className="py-2 pr-4 font-medium">Művelet</th>
                    <th className="py-2 pr-4 font-medium">Entitás</th>
                    <th className="py-2 pr-4 font-medium">Azonosító</th>
                    <th className="py-2 pr-4 font-medium">Ki</th>
                    <th className="py-2 pr-4 font-medium">Részletek</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b">
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleString("hu-HU")}
                      </td>
                      <td className="py-2 pr-4">{ACTION_LABELS[row.action] ?? row.action}</td>
                      <td className="py-2 pr-4">{entityLabel(row.entityType)}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{row.entityKey}</td>
                      <td className="py-2 pr-4">{row.actorIdentifier ?? "—"}</td>
                      <td className="py-2 pr-4">{row.summary ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {totalItems > PAGE_SIZE && (
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
          )}
        </PageBlock>
      </PageLayout>
    </Page>
  );
}

function entityLabel(entityType: string): string {
  switch (entityType) {
    case "material":
      return "Anyag";
    case "product-definition":
      return "Termékdefiníció";
    case "product":
      return "Natív termék";
    case "promotion":
      return "Szett-kedvezmény";
    default:
      return entityType;
  }
}
