/**
 * Dashboard extension for the ProductPlugin: creation of configurator products
 * via the `/product-definitions/new` route (opened from the stock products
 * list's action bar) and a configurator block embedded on the stock
 * product-detail page for products generated from a definition (ADR 0010
 * decision 3) — that block is the editor home and hosts delete. The shared
 * ConfiguratorEditor edits the canonical definition in its input shape and
 * re-validates it with the canonical schema on save; the server re-derives
 * the native option groups/variants via the queued sync, whose state and
 * staleness the editor surfaces.
 *
 * Prices are whole Forints end to end (the backend's ForintMoneyStrategy sets
 * minor-unit precision 0), so no editor-side conversion happens.
 *
 * Type-checked by src/dashboard/tsconfig.json (`check:dashboard`); at build
 * time the dashboard's vite pipeline bundles this file. The typed graphql
 * documents come from the backend's generated schema (src/gql).
 */
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import {
  Alert,
  AlertTitle,
  api,
  Badge,
  Button,
  ConfirmationDialog,
  defineDashboardExtension,
  Input,
  NEW_ENTITY_PATH,
  NativeSelect,
  PaginatedListDataTable,
  Page,
  PageBlock,
  PageLayout,
  PageTitle,
  StatusBadge,
} from "@vendure/dashboard";
import { defineStateEntries } from "@vendure/dashboard";
import type { PageContextValue } from "@vendure/dashboard";
import {
  canonicalJson,
  PRODUCT_TYPE_VALUES,
  ProductDefinitionSchema,
  type ProductDefinitionInput,
} from "@babasarok/product-definition";
import { graphql } from "@/gql";
import { Switch } from "@/vdb/components/ui/switch.js";

const productDefinitionQuery = graphql(`
  query ProductDefinition($productId: String!) {
    productDefinition(productId: $productId) {
      productId
      label
      type
      orderable
      basePrice
      nativeProductId
      syncState
      syncError
      stale
      definition
    }
  }
`);

const productDefinitionByNativeProductQuery = graphql(`
  query ProductDefinitionByNativeProduct($nativeProductId: Int!) {
    productDefinitionByNativeProduct(nativeProductId: $nativeProductId) {
      productId
    }
  }
`);

const materialOptionsQuery = graphql(`
  query MaterialOptions {
    materials {
      slug
      label
    }
  }
`);

const createProductDefinitionMutation = graphql(`
  mutation CreateProductDefinition($definition: JSON!) {
    createProductDefinition(definition: $definition) {
      productId
      nativeProductId
    }
  }
`);

const updateProductDefinitionMutation = graphql(`
  mutation UpdateProductDefinition($productId: String!, $definition: JSON!, $force: Boolean) {
    updateProductDefinition(productId: $productId, definition: $definition, force: $force) {
      productId
      syncState
      syncError
    }
  }
`);

const deleteProductDefinitionMutation = graphql(`
  mutation DeleteProductDefinition($productId: String!) {
    deleteProductDefinition(productId: $productId)
  }
`);

const generatedVariantsQuery = graphql(`
  query GeneratedVariants($productDefinitionId: String!, $options: GeneratedVariantListOptions!) {
    generatedVariants(productDefinitionId: $productDefinitionId, options: $options) {
      items {
        id
        name
        sku
        price
      }
      totalItems
    }
  }
`);

/** The definition's fields in their input shape (plain, unbranded strings),
 * which is what text inputs naturally produce. */
type FieldInput = ProductDefinitionInput["fields"][number];
type ChoiceFieldInput = Extract<FieldInput, { kind: "choice" }>;
type ChoiceOptionInput = ChoiceFieldInput["options"][number];
type ToggleFieldInput = Extract<FieldInput, { kind: "toggle" }>;
type MaterialFieldInput = Extract<FieldInput, { kind: "material" }>;
type MaterialOptionInput = MaterialFieldInput["options"][number];
type InputFieldInput = Extract<FieldInput, { kind: "input" }>;
type EmbroideryFieldInput = Extract<FieldInput, { kind: "embroidery" }>;

const FIELD_KINDS = ["choice", "toggle", "material", "input", "embroidery"] as const;
type FieldKind = (typeof FIELD_KINDS)[number];

const FIELD_KIND_LABELS: Record<FieldKind, string> = {
  choice: "Választó",
  toggle: "Kapcsoló",
  material: "Anyag",
  input: "Szabad szöveg",
  embroidery: "Hímzés",
};

const PRESENTATIONS = ["select", "radio", "color"] as const;

const PRESENTATION_LABELS: Record<ChoiceFieldInput["presentation"], string> = {
  select: "Legördülő",
  radio: "Rádiógomb",
  color: "Színminta",
};

const EMBROIDERY_PRICINGS = ["per-word", "flat"] as const;

const EMBROIDERY_PRICING_LABELS: Record<
  Extract<FieldInput, { kind: "embroidery" }>["pricing"]["kind"],
  string
> = {
  "per-word": "Szavanként",
  flat: "Egyszeri",
};

type FieldRow = { key: string; field: FieldInput };

interface SyncInfo {
  state: string;
  error: string | null;
  stale: boolean;
}

const syncStateDictionary = defineStateEntries({
  pending: { tone: "progress", defaultLabel: "Szinkronizálás…" },
  synced: { tone: "success", defaultLabel: "Szinkronizálva" },
  failed: { tone: "critical", defaultLabel: "Szinkronizálás sikertelen" },
});

function rowKey(): string {
  return crypto.randomUUID();
}

function newField(kind: FieldKind, id: string, label: string): FieldInput {
  const base = { id, label };

  switch (kind) {
    case "choice":
      return {
        ...base,
        kind: "choice",
        presentation: "select",
        price: 0,
        visibility: { kind: "always" },
        options: [{ id: "", label: "", price: 0 }],
      };
    case "toggle":
      return { ...base, kind: "toggle", visibility: { kind: "always" }, price: 0 };
    case "material":
      return {
        ...base,
        kind: "material",
        options: [],
        colorCount: { kind: "fixed", count: 1 },
      };
    case "input":
      return {
        ...base,
        kind: "input",
        visibility: { kind: "always" },
        required: true,
        price: 0,
      };
    case "embroidery":
      return {
        ...base,
        kind: "embroidery",
        visibility: { kind: "always" },
        pricing: { kind: "per-word", pricePerWord: 0 },
      };
  }
}

/** Whether the field holds anything beyond a fresh row's defaults — a kind
 * switch would discard exactly that, so it is what the confirm asks about. */
function hasEditableData(field: FieldInput): boolean {
  const comparable = (candidate: FieldInput): FieldInput => ({ ...candidate, id: "", label: "" });

  return (
    canonicalJson(comparable(field)) !== canonicalJson(comparable(newField(field.kind, "", "")))
  );
}

/** Carries the kind-independent pass-through fields across a kind switch.
 * Material fields carry no tooltip or visibility, so they keep their own. */
function carryOver(next: FieldInput, previous: FieldInput): FieldInput {
  if (next.kind === "material") {
    return next;
  }

  const carried = {
    ...next,
    visibility: previous.kind === "material" ? next.visibility : previous.visibility,
  };

  if (previous.tooltip !== undefined) {
    carried.tooltip = previous.tooltip;
  }

  return carried;
}

/** Trims the values the editor can introduce untrimmed, so the canonical
 * schema rejects nothing on formatting alone. */
function sanitize(definition: ProductDefinitionInput): ProductDefinitionInput {
  return {
    ...definition,
    label: definition.label.trim(),
    fields: definition.fields.map((field) => {
      const trimmed = { ...field, id: field.id.trim(), label: field.label.trim() };

      if (trimmed.kind === "choice") {
        return {
          ...trimmed,
          options: trimmed.options.map((option) => ({
            ...option,
            id: option.id.trim(),
            label: option.label.trim(),
          })),
        };
      }

      if (trimmed.kind === "material") {
        return {
          ...trimmed,
          options: trimmed.options.map((option) => ({
            ...option,
            materialId: option.materialId.trim(),
          })),
        };
      }

      return trimmed;
    }),
    forbiddenMaterialCombinations: definition.forbiddenMaterialCombinations.map((rule) =>
      rule.map((materialId) => materialId.trim())
    ),
  };
}

function newDefinition(
  id: string,
  label: string,
  type: ProductDefinitionInput["type"]
): ProductDefinitionInput {
  return {
    id,
    label,
    type,
    orderable: true,
    basePrice: 0,
    pricing: { kind: "unit" },
    fields: [],
    forbiddenMaterialCombinations: [],
  };
}

/** Duplicates the server cannot catch yet: option ids within a choice field
 * and the same material twice in one material field. */
function duplicates(definition: ProductDefinitionInput): string[] {
  const found: string[] = [];

  for (const field of definition.fields) {
    if (field.kind === "choice") {
      const ids = field.options.map((option) => option.id.trim());

      for (const id of new Set(ids.filter((candidate, at) => ids.indexOf(candidate) !== at))) {
        found.push(`${field.label} (${field.id}): duplikált opciókód: "${id}"`);
      }
    }

    if (field.kind === "material") {
      const materials = field.options.map((option) => option.materialId.trim());

      for (const materialId of new Set(
        materials.filter((candidate, at) => materials.indexOf(candidate) !== at)
      )) {
        found.push(`${field.label} (${field.id}): duplikált anyag: "${materialId}"`);
      }
    }
  }

  return found;
}

// Extensions load for side effects only (the dashboard's virtual module
// dynamic-imports this file); the registration call must run on import.
defineDashboardExtension({
  routes: [
    {
      path: "/product-definitions/new",
      component: () => <NewProductDefinitionPage />,
    },
  ],
  pageBlocks: [
    {
      id: "product-definition-configurator",
      title: "Konfigurátor",
      description: "A strukturált termékmotor szerkesztője, beágyazva a stock terméklapra.",
      location: {
        pageId: "product-detail",
        column: "main",
        position: { blockId: "main-form", order: "after" },
      },
      component: ProductConfiguratorBlock,
    },
  ],
  actionBarItems: [
    {
      pageId: "product-list",
      component: NewProductDefinitionActionBarItem,
      requiresPermission: ["UpdateCatalog"],
    },
  ],
});

/** The stock products list's entry point for creating a configurator product. */
function NewProductDefinitionActionBarItem(): ReactElement {
  const navigate = useNavigate();

  return (
    <Button
      type="button"
      onClick={() => {
        void navigate({ to: "/product-definitions/new" });
      }}
    >
      Új konfigurátor termék
    </Button>
  );
}

function NewProductDefinitionPage(): ReactElement {
  return (
    <Page pageId="product-definition-create">
      <PageTitle>Új konfigurátor termék</PageTitle>
      <ConfiguratorEditor definitionId={NEW_ENTITY_PATH} mode="create" />
    </Page>
  );
}

function SyncBadge({ sync }: { sync: SyncInfo | null }): ReactElement {
  if (sync === null) {
    return <></>;
  }

  const stateLabel = syncStateDictionary.labelFor(sync.state);

  return (
    <span className="flex items-center gap-2">
      <StatusBadge tone={syncStateDictionary.toneFor(sync.state)} dot={sync.state === "pending"}>
        {stateLabel}
      </StatusBadge>
      {sync.stale && sync.state !== "pending" && (
        <Badge variant="warning">Elavult — mentéskor újraszinkronizálódik</Badge>
      )}
    </span>
  );
}

/** Numeric text input: types freely (Hungarian comma decimals accepted), and
 * commits on blur — an empty field means 0, an unparseable value reverts. */
function NumberInput({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}): ReactElement {
  const parse = (raw: string): number => {
    const normalized = raw.trim().replace(",", ".");

    if (normalized === "" || Number.isNaN(Number(normalized))) {
      return value;
    }

    return Number(normalized);
  };
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText((current) => (parse(current) === value ? current : String(value)));
  }, [value]);

  return (
    <Input
      type="text"
      inputMode="decimal"
      className={className}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
      }}
      onBlur={() => {
        const parsed = parse(text);
        setText(String(parsed));
        onChange(parsed);
      }}
    />
  );
}

/** The configurator editor shared by the create route and the embedded stock
 * product-detail block. Renders PageLayout content only; the create page
 * supplies the page title and framing. */
function ConfiguratorEditor({
  definitionId,
  mode,
}: {
  definitionId: string;
  mode: "create" | "embedded";
}): ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const creatingNew = mode === "create";

  const [definition, setDefinition] = useState<ProductDefinitionInput | null>(() =>
    creatingNew ? newDefinition("", "", PRODUCT_TYPE_VALUES[0]) : null
  );
  const [rows, setRows] = useState<FieldRow[]>([]);
  const [banned, setBanned] = useState<string[][]>([]);
  const [materialOptions, setMaterialOptions] = useState<Array<{ slug: string; label: string }>>(
    []
  );
  const [sync, setSync] = useState<SyncInfo | null>(null);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [driftConflict, setDriftConflict] = useState(false);
  const [kindSwitchKey, setKindSwitchKey] = useState<{
    key: string;
    kind: FieldKind;
    label: string;
  } | null>(null);
  const [variantPage, setVariantPage] = useState(1);
  const [variantPageSize, setVariantPageSize] = useState(20);
  // Structural SortingState (the dashboard package doesn't re-export the type).
  const [variantSorting, setVariantSorting] = useState<Array<{ id: string; desc: boolean }>>([]);
  const pollRun = useRef(0);

  useEffect(() => {
    api
      .query(materialOptionsQuery, {})
      .then((result) => {
        setMaterialOptions(result.materials);
      })
      .catch((err: unknown) => {
        setErrors([String(err)]);
      });
  }, []);

  useEffect(() => {
    if (creatingNew) {
      return;
    }

    api
      .query(productDefinitionQuery, { productId: definitionId })
      .then((result) => {
        if (result.productDefinition === null) {
          setErrors([`Nincs termék ezzel az azonosítóval: ${definitionId}`]);
          return;
        }

        const parsed = ProductDefinitionSchema.parse(result.productDefinition.definition);
        setDefinition(parsed);
        setRows(parsed.fields.map((field) => ({ key: rowKey(), field })));
        setBanned(parsed.forbiddenMaterialCombinations.map((rule) => [...rule]));
        setSync({
          state: result.productDefinition.syncState,
          error: result.productDefinition.syncError,
          stale: result.productDefinition.stale,
        });

        if (result.productDefinition.syncState === "pending") {
          void pollSync(definitionId);
        }
      })
      .catch((err: unknown) => {
        setErrors([String(err)]);
      });

    // Any in-flight poll belongs to the previous product.
    pollRun.current += 1;
  }, [creatingNew, definitionId]);

  // Leaving the editor (or switching products) must not leave a zombie poll
  // writing one product's state onto another's badge.
  useEffect(() => {
    return () => {
      pollRun.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!saved) {
      return;
    }

    const timer = setTimeout(() => {
      setSaved(false);
    }, 4000);

    return () => {
      clearTimeout(timer);
    };
  }, [saved]);

  const dirty =
    definition !== null &&
    (definition.id !== "" || definition.label !== "" || rows.length > 0 || banned.length > 0);

  // Guards only the create route: the embedded block shares the stock
  // product page's navigation, where blocking is too broad a blast radius.
  useBlocker({
    shouldBlockFn: () => mode === "create" && !pending && dirty,
  });

  function patchBase(key: string, id: string, label: string): void {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, field: { ...row.field, id, label } } : row))
    );
  }

  function patchChoice(key: string, patch: Partial<ChoiceFieldInput>): void {
    setRows((current) =>
      current.map((row) =>
        row.key === key && row.field.kind === "choice"
          ? { ...row, field: { ...row.field, ...patch } }
          : row
      )
    );
  }

  function patchToggle(key: string, patch: Partial<ToggleFieldInput>): void {
    setRows((current) =>
      current.map((row) =>
        row.key === key && row.field.kind === "toggle"
          ? { ...row, field: { ...row.field, ...patch } }
          : row
      )
    );
  }

  function patchMaterial(key: string, patch: Partial<MaterialFieldInput>): void {
    setRows((current) =>
      current.map((row) =>
        row.key === key && row.field.kind === "material"
          ? { ...row, field: { ...row.field, ...patch } }
          : row
      )
    );
  }

  function patchInputField(key: string, patch: Partial<InputFieldInput>): void {
    setRows((current) =>
      current.map((row) =>
        row.key === key && row.field.kind === "input"
          ? { ...row, field: { ...row.field, ...patch } }
          : row
      )
    );
  }

  function patchEmbroidery(key: string, patch: Partial<EmbroideryFieldInput>): void {
    setRows((current) =>
      current.map((row) =>
        row.key === key && row.field.kind === "embroidery"
          ? { ...row, field: { ...row.field, ...patch } }
          : row
      )
    );
  }

  function patchChoiceOptions(
    key: string,
    transform: (options: ChoiceOptionInput[]) => ChoiceOptionInput[]
  ): void {
    setRows((current) =>
      current.map((row) => {
        if (row.key !== key || row.field.kind !== "choice") {
          return row;
        }

        return { ...row, field: { ...row.field, options: transform(row.field.options) } };
      })
    );
  }

  function patchMaterialOptions(
    key: string,
    transform: (options: MaterialOptionInput[]) => MaterialOptionInput[]
  ): void {
    setRows((current) =>
      current.map((row) => {
        if (row.key !== key || row.field.kind !== "material") {
          return row;
        }

        return { ...row, field: { ...row.field, options: transform(row.field.options) } };
      })
    );
  }

  function addField(kind: FieldKind): void {
    setRows((current) => [...current, { key: rowKey(), field: newField(kind, "", "") }]);
  }

  function changeFieldKind(key: string, kind: FieldKind): void {
    const row = rows.find((candidate) => candidate.key === key);

    if (row === undefined || row.field.kind === kind) {
      return;
    }

    if (hasEditableData(row.field)) {
      setKindSwitchKey({ key, kind, label: row.field.label });
      return;
    }

    applyKindSwitch(key, kind);
  }

  function applyKindSwitch(key: string, kind: FieldKind): void {
    setRows((current) =>
      current.map((row) => {
        if (row.key !== key) {
          return row;
        }

        return {
          key: rowKey(),
          field: carryOver(newField(kind, row.field.id, row.field.label), row.field),
        };
      })
    );
  }

  function removeField(key: string): void {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  function moveField(key: string, delta: number): void {
    setRows((current) => {
      const index = current.findIndex((row) => row.key === key);
      const target = index + delta;

      if (index < 0 || target < 0 || target >= current.length) {
        return current;
      }

      const moved = [...current];
      const [row] = moved.splice(index, 1);
      moved.splice(target, 0, row);
      return moved;
    });
  }

  /** Polls the definition until the queued sync settles. Survives network
   * hiccups (visible retrying note), never outlives the editor, and refreshes
   * the generated-variants table when the sync settles. */
  async function pollSync(productId: string): Promise<void> {
    const run = ++pollRun.current;
    let consecutiveFailures = 0;
    let sawPending = false;

    while (pollRun.current === run) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      if (pollRun.current !== run) {
        return;
      }

      try {
        const result = await api.query(productDefinitionQuery, { productId });

        if (pollRun.current !== run) {
          return;
        }

        if (result.productDefinition === null) {
          return;
        }

        const next: SyncInfo = {
          state: result.productDefinition.syncState,
          error: result.productDefinition.syncError,
          stale: result.productDefinition.stale,
        };
        setSync(next);

        if (next.state !== "pending") {
          if (sawPending) {
            void queryClient.invalidateQueries({ queryKey: [productId] });
          }

          return;
        }

        sawPending = true;
        consecutiveFailures = 0;
      } catch {
        consecutiveFailures += 1;

        if (consecutiveFailures >= 3) {
          setSync((current) =>
            current === null
              ? current
              : { ...current, error: "Állapotlekérés nem sikerült — újrapróbálás…" }
          );
        }
      }
    }
  }

  async function save(force: boolean): Promise<void> {
    if (definition === null) {
      return;
    }

    setErrors(null);
    setSaved(false);
    setDriftConflict(false);

    const payload = sanitize(definition);
    const clientErrors: string[] = [];

    if (creatingNew && (payload.id === "" || payload.label === "")) {
      clientErrors.push("Az azonosító és a név is kötelező.");
    }

    if (creatingNew && payload.id === NEW_ENTITY_PATH) {
      clientErrors.push('Az azonosító nem lehet "new".');
    }

    clientErrors.push(...duplicates(payload));

    let validated: ProductDefinitionInput;

    try {
      validated = ProductDefinitionSchema.parse(payload);
    } catch (error: unknown) {
      const issues =
        typeof error === "object" && error !== null && "issues" in error
          ? (error.issues as Array<{ path: Array<string | number | symbol>; message: string }>)
          : [];

      setErrors([
        ...clientErrors,
        ...issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
      ]);
      return;
    }

    if (clientErrors.length > 0) {
      setErrors(clientErrors);
      return;
    }

    setPending(true);

    try {
      if (creatingNew) {
        const result = await api.query(createProductDefinitionMutation, { definition: validated });
        const created = result.createProductDefinition;

        if (created.nativeProductId === null) {
          setErrors(["A termék létrejött, de a natív termék megnyitása nem sikerült."]);
          return;
        }

        await navigate({
          to: "/products/$id",
          params: { id: String(created.nativeProductId) },
        });
      } else {
        const result = await api.query(updateProductDefinitionMutation, {
          productId: definitionId,
          definition: validated,
          force,
        });
        setSync({
          state: result.updateProductDefinition.syncState,
          error: result.updateProductDefinition.syncError,
          stale: false,
        });
        setSaved(true);
        void pollSync(definitionId);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setErrors(message.split("\n"));

      if (errorCodeOf(err) === "PRODUCT_DEFINITION_NATIVE_DRIFT") {
        setDriftConflict(true);
      }
    } finally {
      setPending(false);
    }
  }

  async function remove(): Promise<void> {
    setPending(true);

    try {
      await api.query(deleteProductDefinitionMutation, { productId: definitionId });
      await navigate({ to: "/products" });
    } catch (err: unknown) {
      setErrors(err instanceof Error ? err.message.split("\n") : [String(err)]);
      setPending(false);
    }
  }

  if (definition === null) {
    if (errors !== null) {
      return <ErrorNotice message={errors.join("\n")} />;
    }

    return <></>;
  }

  const lengthPricing =
    definition.pricing.kind === "length"
      ? `Méteráras árazás (mező: ${definition.pricing.sourceFieldId}) — a variánsok ára 0 Ft.`
      : null;
  const discount =
    definition.discount === undefined
      ? null
      : `Kedvezmény: ${definition.discount.percent}% — ${definition.discount.validUntil}sig.`;

  const editor = (
    <>
      <PageBlock
        column="main"
        blockId="product-definition-form"
        title="Termék"
        description="A mentés után a natív termékszerkezet a háttérben újragenerálódik. A mezők kiegészítő tulajdonságai (megjelenítési függőségek, tippek, minták) változatlanul megőrződnek."
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              void save(false);
            }}
          >
            {creatingNew ? "Létrehozás" : "Mentés"}
          </Button>
          {!creatingNew && (
            <ConfirmationDialog
              title="Termék törlése"
              description={`Biztosan törlöd a terméket: ${definition.id}? A natív termék is törlődik.`}
              destructive
              onConfirm={() => {
                void remove();
              }}
            >
              <Button type="button" variant="destructive" disabled={pending}>
                Törlés
              </Button>
            </ConfirmationDialog>
          )}
          <SyncBadge sync={sync} />
        </div>
        {errors !== null && <ErrorNotice message={errors.join("\n")} />}
        {driftConflict && (
          <Alert variant="destructive">
            <AlertTitle>
              A natív termék opciói, változatai vagy árai a szinkronizáláson kívül módosultak. A
              mentés a szinkronizálással felülírja ezeket.
            </AlertTitle>
            <div className="mt-2">
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={() => {
                  void save(true);
                }}
              >
                Natív módosítások felülírása (force)
              </Button>
            </div>
          </Alert>
        )}
        {saved && (
          <Alert>
            <AlertTitle>Mentés sikeres — a szinkronizálás fut.</AlertTitle>
          </Alert>
        )}
        {sync?.state === "failed" && (
          <ErrorNotice
            message={
              (sync.error ?? "") +
              "\nA szinkronizálás a következő mentéskor újra indul — javítsd az okát, majd mentsd újra."
            }
          />
        )}

        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span>Azonosító</span>
            {creatingNew ? (
              <>
                <Input
                  className="w-64"
                  value={definition.id}
                  onChange={(e) => {
                    setDefinition({ ...definition, id: e.target.value });
                  }}
                />
                <span className="text-muted-foreground text-xs">
                  Végleges: a natív termék slugja is ez lesz. Nem lehet "new".
                </span>
              </>
            ) : (
              <span className="font-mono text-xs">{definition.id}</span>
            )}
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Típus</span>
            {creatingNew ? (
              <NativeSelect
                className="w-64"
                value={definition.type}
                onChange={(e) => {
                  const type = PRODUCT_TYPE_VALUES.find(
                    (candidate) => candidate === e.target.value
                  );

                  if (type !== undefined) {
                    setDefinition({ ...definition, type });
                  }
                }}
              >
                {PRODUCT_TYPE_VALUES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <span className="text-xs">{definition.type}</span>
            )}
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Név</span>
            <Input
              className="w-80"
              value={definition.label}
              onChange={(e) => {
                setDefinition({ ...definition, label: e.target.value });
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Alapár (Ft)</span>
            <NumberInput
              className="w-40"
              value={definition.basePrice}
              onChange={(basePrice) => {
                setDefinition({ ...definition, basePrice });
              }}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span>Rendelhető</span>
            <Switch
              checked={definition.orderable}
              onCheckedChange={(checked) => {
                setDefinition({ ...definition, orderable: checked });
              }}
            />
          </label>
          {lengthPricing !== null && (
            <p className="text-muted-foreground text-xs">{lengthPricing}</p>
          )}
          {discount !== null && <p className="text-muted-foreground text-xs">{discount}</p>}
        </div>
      </PageBlock>
      <PageBlock
        column="main"
        blockId="product-definition-fields"
        title="Mezők"
        description="Minden választó, kapcsoló és anyagmező natív opciócsoportot és variánsokat generál; a szabad szöveg és a hímzés a rendelési sorokon él tovább."
      >
        <div className="flex flex-col gap-4">
          {rows.map((row, index) => (
            <FieldEditor
              key={row.key}
              row={row}
              index={index}
              count={rows.length}
              materialOptions={materialOptions}
              patchBase={patchBase}
              patchChoice={patchChoice}
              patchToggle={patchToggle}
              patchMaterial={patchMaterial}
              patchInputField={patchInputField}
              patchEmbroidery={patchEmbroidery}
              patchChoiceOptions={patchChoiceOptions}
              patchMaterialOptions={patchMaterialOptions}
              changeFieldKind={changeFieldKind}
              removeField={removeField}
              moveField={moveField}
            />
          ))}
          <div className="flex flex-wrap gap-2">
            {FIELD_KINDS.map((kind) => (
              <Button
                key={kind}
                type="button"
                variant="outline"
                onClick={() => {
                  addField(kind);
                }}
              >
                + {FIELD_KIND_LABELS[kind]} mező
              </Button>
            ))}
          </div>
        </div>
      </PageBlock>
      <PageBlock
        column="main"
        blockId="product-definition-banned"
        title="Tiltott anyagkombinációk"
        description="Az itt felsorolt anyagpárok (akkor is, ha ugyanaz az anyag kétszer szerepel) nem fordulhatnak elő együtt egy választásban."
      >
        <div className="flex flex-col gap-2">
          {banned.map((rule, index) => (
            <div key={index} className="flex items-end gap-2">
              {rule.map((materialId, memberIndex) => (
                <label key={memberIndex} className="flex flex-col gap-1 text-sm">
                  <span>Anyag {memberIndex + 1}</span>
                  <NativeSelect
                    className="w-52"
                    value={materialId}
                    onChange={(e) => {
                      setBanned((current) =>
                        current.map((candidate, candidateIndex) =>
                          candidateIndex === index
                            ? candidate.map((member, memberAt) =>
                                memberAt === memberIndex ? e.target.value : member
                              )
                            : candidate
                        )
                      );
                    }}
                  >
                    <option value="">Válassz anyagot…</option>
                    {materialOptions.map((material) => (
                      <option key={material.slug} value={material.slug}>
                        {material.label} ({material.slug})
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              ))}
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setBanned((current) => current.filter((_, at) => at !== index));
                }}
              >
                Sor törlése
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setBanned((current) => [...current, ["", ""]]);
              }}
            >
              + Kombináció hozzáadása
            </Button>
          </div>
        </div>
      </PageBlock>
      {!creatingNew && (
        <PageBlock
          column="main"
          blockId="product-definition-generated"
          title="Generált natív struktúra"
          description="A szinkronizálás által előállított natív opciócsoportok és variánsok."
        >
          <div className="flex flex-col gap-4">
            <PaginatedListDataTable
              listQuery={generatedVariantsQuery}
              // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment -- under the repo's TS 6 (eslint's parser) the PaginatedListDataTable generics fall back to `any`; tsc 5.9 (check:dashboard, the gate for dashboard extensions) type-checks this concretely and passes
              transformQueryKey={(queryKey) => [definitionId, ...queryKey]}
              transformVariables={(variables) => ({
                productDefinitionId: definitionId,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- under the repo's TS 6 (eslint's parser) the PaginatedListDataTable generics fall back to `any`; tsc 5.9 (check:dashboard, the gate for dashboard extensions) type-checks this concretely and passes
                options: variables.options,
              })}
              page={variantPage}
              itemsPerPage={variantPageSize}
              sorting={variantSorting}
              onPageChange={(_table, page, perPage) => {
                setVariantPage(page);
                setVariantPageSize(perPage);
              }}
              onSortChange={(_table, sorting) => {
                setVariantSorting(sorting);
              }}
              customizeColumns={{
                id: { header: "ID", enableSorting: false },
                name: { header: "Név", enableSorting: false },
                sku: { header: "SKU", enableSorting: false },
                price: { header: "Ár (Ft)", enableSorting: false },
              }}
            />
          </div>
        </PageBlock>
      )}
    </>
  );

  return (
    <PageLayout>
      {editor}
      {kindSwitchKey !== null && (
        <Alert variant="destructive">
          <AlertTitle>
            A(z) "{kindSwitchKey.label}" mezőhöz tartozó adatok (opciók, árak, beállítások)
            elvesznek a típusváltáskor.
          </AlertTitle>
          <div className="mt-2 flex gap-2">
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const switching = kindSwitchKey;
                setKindSwitchKey(null);
                applyKindSwitch(switching.key, switching.kind);
              }}
            >
              Mégis cserélem
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setKindSwitchKey(null);
              }}
            >
              Mégse
            </Button>
          </div>
        </Alert>
      )}
    </PageLayout>
  );
}

/** Reads the GraphQL error code without assuming a client error shape. */
function errorCodeOf(err: unknown): string | undefined {
  if (!(err instanceof Error) || !("extensions" in err)) {
    return undefined;
  }

  const extensions = err.extensions;

  if (typeof extensions !== "object" || extensions === null || !("code" in extensions)) {
    return undefined;
  }

  const code = extensions.code;
  return typeof code === "string" ? code : undefined;
}

interface FieldEditorProps {
  row: FieldRow;
  index: number;
  count: number;
  materialOptions: Array<{ slug: string; label: string }>;
  patchBase: (key: string, id: string, label: string) => void;
  patchChoice: (key: string, patch: Partial<ChoiceFieldInput>) => void;
  patchToggle: (key: string, patch: Partial<ToggleFieldInput>) => void;
  patchMaterial: (key: string, patch: Partial<MaterialFieldInput>) => void;
  patchInputField: (key: string, patch: Partial<InputFieldInput>) => void;
  patchEmbroidery: (key: string, patch: Partial<EmbroideryFieldInput>) => void;
  patchChoiceOptions: (
    key: string,
    transform: (options: ChoiceOptionInput[]) => ChoiceOptionInput[]
  ) => void;
  patchMaterialOptions: (
    key: string,
    transform: (options: MaterialOptionInput[]) => MaterialOptionInput[]
  ) => void;
  changeFieldKind: (key: string, kind: FieldKind) => void;
  removeField: (key: string) => void;
  moveField: (key: string, delta: number) => void;
}

function FieldEditor({
  row,
  index,
  count,
  materialOptions,
  patchBase,
  patchChoice,
  patchToggle,
  patchMaterial,
  patchInputField,
  patchEmbroidery,
  patchChoiceOptions,
  patchMaterialOptions,
  changeFieldKind,
  removeField,
  moveField,
}: FieldEditorProps): ReactElement {
  const field = row.field;

  function setBase(next: { id: string; label: string }): void {
    patchBase(row.key, next.id, next.label);
  }

  return (
    <div className="flex flex-col gap-3 rounded border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span>Típus</span>
          <NativeSelect
            value={field.kind}
            onChange={(e) => {
              const kind = FIELD_KINDS.find((candidate) => candidate === e.target.value);

              if (kind !== undefined) {
                changeFieldKind(row.key, kind);
              }
            }}
          >
            {FIELD_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {FIELD_KIND_LABELS[kind]}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Kód</span>
          <Input
            className="w-32"
            value={field.id}
            onChange={(e) => {
              setBase({ ...field, id: e.target.value });
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span>Név</span>
          <Input
            className="w-44"
            value={field.label}
            onChange={(e) => {
              setBase({ ...field, label: e.target.value });
            }}
          />
        </label>
        {field.kind === "choice" && (
          <label className="flex flex-col gap-1 text-sm">
            <span>Megjelenés</span>
            <NativeSelect
              value={field.presentation}
              onChange={(e) => {
                const presentation = PRESENTATIONS.find(
                  (candidate) => candidate === e.target.value
                );

                if (presentation !== undefined) {
                  patchChoice(row.key, { presentation });
                }
              }}
            >
              {PRESENTATIONS.map((presentation) => (
                <option key={presentation} value={presentation}>
                  {PRESENTATION_LABELS[presentation]}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        {field.kind === "toggle" && (
          <label className="flex flex-col gap-1 text-sm">
            <span>Ár ha bekapcsolva (Ft)</span>
            <NumberInput
              className="w-32"
              value={field.price}
              onChange={(price) => {
                patchToggle(row.key, { price });
              }}
            />
          </label>
        )}
        {field.kind === "input" && (
          <>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={field.required}
                onCheckedChange={(checked) => {
                  patchInputField(row.key, { required: checked });
                }}
              />
              <span>Kötelező</span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Ár (Ft)</span>
              <NumberInput
                className="w-28"
                value={field.price}
                onChange={(price) => {
                  patchInputField(row.key, { price });
                }}
              />
            </label>
          </>
        )}
        {field.kind === "embroidery" && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span>Árazás</span>
              <NativeSelect
                value={field.pricing.kind}
                onChange={(e) => {
                  const kind = EMBROIDERY_PRICINGS.find(
                    (candidate) => candidate === e.target.value
                  );

                  if (kind === undefined) {
                    return;
                  }

                  // Carry the numeric across the pricing-mode switch.
                  const amount =
                    field.pricing.kind === "per-word"
                      ? field.pricing.pricePerWord
                      : field.pricing.price;

                  patchEmbroidery(row.key, {
                    pricing:
                      kind === "per-word"
                        ? { kind: "per-word", pricePerWord: amount }
                        : { kind: "flat", price: amount },
                  });
                }}
              >
                {EMBROIDERY_PRICINGS.map((kind) => (
                  <option key={kind} value={kind}>
                    {EMBROIDERY_PRICING_LABELS[kind]}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>{field.pricing.kind === "per-word" ? "Ár / szó (Ft)" : "Ár (Ft)"}</span>
              <NumberInput
                className="w-28"
                value={
                  field.pricing.kind === "per-word"
                    ? field.pricing.pricePerWord
                    : field.pricing.price
                }
                onChange={(value) => {
                  patchEmbroidery(row.key, {
                    pricing:
                      field.pricing.kind === "per-word"
                        ? { kind: "per-word", pricePerWord: value }
                        : { kind: "flat", price: value },
                  });
                }}
              />
            </label>
          </>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            disabled={index === 0}
            onClick={() => {
              moveField(row.key, -1);
            }}
          >
            ▲
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={index === count - 1}
            onClick={() => {
              moveField(row.key, 1);
            }}
          >
            ▼
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              removeField(row.key);
            }}
          >
            Mező törlése
          </Button>
        </div>
      </div>

      {field.kind === "choice" && (
        <div className="flex flex-col gap-2">
          {field.options.map((option, optionIndex) => (
            <div key={optionIndex} className="flex items-end gap-2">
              <label className="flex flex-col gap-1 text-sm">
                <span>Kód</span>
                <Input
                  className="w-28"
                  value={option.id}
                  onChange={(e) => {
                    patchChoiceOptions(row.key, (options) =>
                      options.map((candidate, at) =>
                        at === optionIndex ? { ...candidate, id: e.target.value } : candidate
                      )
                    );
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>Név</span>
                <Input
                  className="w-40"
                  value={option.label}
                  onChange={(e) => {
                    patchChoiceOptions(row.key, (options) =>
                      options.map((candidate, at) =>
                        at === optionIndex ? { ...candidate, label: e.target.value } : candidate
                      )
                    );
                  }}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>Ár (Ft)</span>
                <NumberInput
                  className="w-28"
                  value={option.price}
                  onChange={(price) => {
                    patchChoiceOptions(row.key, (options) =>
                      options.map((candidate, at) =>
                        at === optionIndex ? { ...candidate, price } : candidate
                      )
                    );
                  }}
                />
              </label>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  patchChoiceOptions(row.key, (options) =>
                    options.filter((_, at) => at !== optionIndex)
                  );
                }}
              >
                Sor törlése
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                patchChoiceOptions(row.key, (options) => [
                  ...options,
                  { id: "", label: "", price: 0 },
                ]);
              }}
            >
              + Elem hozzáadása
            </Button>
          </div>
        </div>
      )}

      {field.kind === "material" && (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span>Színek száma:</span>
            {field.colorCount.kind === "fixed" ? (
              <NumberInput
                className="w-20"
                value={field.colorCount.count}
                onChange={(count) => {
                  patchMaterial(row.key, { colorCount: { kind: "fixed", count } });
                }}
              />
            ) : (
              <span className="text-xs">
                mezőből ({field.colorCount.fieldId}) — nem itt szerkeszthető
              </span>
            )}
          </label>
          {field.options.map((entry, entryIndex) => (
            <div key={entryIndex} className="flex items-end gap-2">
              <label className="flex flex-col gap-1 text-sm">
                <span>Anyag</span>
                <NativeSelect
                  className="w-52"
                  value={entry.materialId}
                  onChange={(e) => {
                    patchMaterialOptions(row.key, (options) =>
                      options.map((candidate, at) =>
                        at === entryIndex ? { ...candidate, materialId: e.target.value } : candidate
                      )
                    );
                  }}
                >
                  <option value="">Válassz anyagot…</option>
                  {materialOptions.map((material) => (
                    <option key={material.slug} value={material.slug}>
                      {material.label} ({material.slug})
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span>Felár (Ft)</span>
                <NumberInput
                  className="w-28"
                  value={entry.price}
                  onChange={(price) => {
                    patchMaterialOptions(row.key, (options) =>
                      options.map((candidate, at) =>
                        at === entryIndex ? { ...candidate, price } : candidate
                      )
                    );
                  }}
                />
              </label>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  patchMaterialOptions(row.key, (options) =>
                    options.filter((_, at) => at !== entryIndex)
                  );
                }}
              >
                Sor törlése
              </Button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                patchMaterialOptions(row.key, (options) => [
                  ...options,
                  { materialId: "", price: 0 },
                ]);
              }}
            >
              + Anyag hozzáadása
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The embedded block on the stock product-detail page: looks up whether the
 * current product was generated from a ProductDefinition and, if so, renders
 * the configurator editor in place. Definitions create their own native
 * products — an existing product cannot gain one retroactively. */
function ProductConfiguratorBlock({ context }: { context: PageContextValue }): ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- PageContextValue.entity is typed `any` by the dashboard's own contract (page-provider.tsx); there is no typed alternative for extension blocks
  const nativeProductId = Number(context.entity?.id);
  const [definitionId, setDefinitionId] = useState<string | null>(null);
  const [lookedUp, setLookedUp] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);

  useEffect(() => {
    if (!Number.isInteger(nativeProductId) || nativeProductId <= 0) {
      return;
    }

    api
      .query(productDefinitionByNativeProductQuery, { nativeProductId })
      .then((result) => {
        setDefinitionId(result.productDefinitionByNativeProduct?.productId ?? null);
        setLookedUp(true);
      })
      .catch(() => {
        setLookedUp(true);
        setLookupFailed(true);
      });
  }, [nativeProductId]);

  if (!Number.isInteger(nativeProductId) || nativeProductId <= 0) {
    return <></>;
  }

  if (lookupFailed) {
    return (
      <ErrorNotice message="A konfigurátor állapota most nem elérhető — töltsd újra a lapot." />
    );
  }

  if (!lookedUp) {
    return <></>;
  }

  if (definitionId === null) {
    return (
      <p className="text-muted-foreground text-sm">
        Ehhez a termékhez nem tartozik strukturált konfigurátor. Konfigurátor termék a Termékek
        listában hozható létre (Új konfigurátor termék gomb) — meglévő termékhez utólag nem
        csatolható.
      </p>
    );
  }

  return <ConfiguratorEditor key={definitionId} definitionId={definitionId} mode="embedded" />;
}

function ErrorNotice({ message }: { message: string }): ReactElement {
  return (
    <Alert variant="destructive">
      <AlertTitle className="whitespace-pre-wrap">{message}</AlertTitle>
    </Alert>
  );
}
