/**
 * Dashboard extension for the ProductPlugin: a "Termékek" section under the
 * catalog nav (list + create + delete — the creation entry point) and a
 * configurator block embedded on the stock product-detail page for products
 * generated from a definition (ADR 0010 decision 3). The shared
 * ConfiguratorEditor edits the canonical definition in its input shape and
 * re-validates it with the canonical schema on save; the server re-derives
 * the native option groups/variants via the queued sync, whose state and
 * staleness the editor surfaces.
 *
 * Type-checked by src/dashboard/tsconfig.json (`check:dashboard`); at build
 * time the dashboard's vite pipeline bundles this file. The typed graphql
 * documents come from the backend's generated schema (src/gql).
 */
import { useEffect, useRef, useState, type ReactElement } from "react";
import { useNavigate, type AnyRoute } from "@tanstack/react-router";
import {
  ActionBarItem,
  Alert,
  AlertTitle,
  api,
  Button,
  defineDashboardExtension,
  DetailPageButton,
  Input,
  NEW_ENTITY_PATH,
  PaginatedListDataTable,
  Page,
  PageActionBar,
  PageBlock,
  PageLayout,
  PageTitle,
} from "@vendure/dashboard";
import type { PageContextValue } from "@vendure/dashboard";
import {
  ProductDefinitionSchema,
  type ProductDefinitionInput,
} from "@babasarok/product-definition";
import { graphql } from "@/gql";

const productDefinitionsQuery = graphql(`
  query ProductDefinitions {
    productDefinitions {
      productId
      label
      type
      basePrice
      syncState
      stale
    }
  }
`);

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

// Extensions load for side effects only (the dashboard's virtual module
// dynamic-imports this file); the registration call must run on import.
defineDashboardExtension({
  routes: [
    {
      path: "/product-definitions",
      component: () => <ProductDefinitionsListPage />,
      navMenuItem: { sectionId: "catalog", title: "Termékek" },
    },
    {
      path: "/product-definitions/$id",
      component: (route) => <ProductDefinitionDetailPage route={route} />,
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
});

/** Thin wrapper: the standalone route keeps its own Page + title around the
 * shared editor. */
function ProductDefinitionDetailPage({ route }: { route: AnyRoute }): ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- the dashboard's extension contract passes an AnyRoute whose useParams() is untyped any (vendure's own detail-page.tsx reads params the same way); there is no typed alternative
  const definitionId: string = route.useParams().id ?? "";

  return (
    <Page pageId="product-definition-detail">
      <ConfiguratorEditor definitionId={definitionId} mode="standalone" />
    </Page>
  );
}

function SyncBadge({ state, stale }: { state: string; stale: boolean }): ReactElement {
  const label =
    state === "pending"
      ? "Szinkronizálás…"
      : state === "failed"
        ? "Szinkronizálás sikertelen"
        : "Szinkronizálva";

  return (
    <span className="flex items-center gap-2 text-xs">
      <span
        className={
          "rounded px-2 py-0.5 " +
          (state === "pending"
            ? "bg-blue-100 text-blue-800"
            : state === "failed"
              ? "bg-red-100 text-red-800"
              : "bg-green-100 text-green-800")
        }
      >
        {label}
      </span>
      {stale && (
        <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">
          Elavult — mentéskor újraszinkronizálódik
        </span>
      )}
    </span>
  );
}

function ProductDefinitionsListPage(): ReactElement {
  const [rows, setRows] = useState<
    Array<{
      productId: string;
      label: string;
      type: string;
      basePrice: number;
      syncState: string;
      stale: boolean;
    }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .query(productDefinitionsQuery, {})
      .then((result) => {
        setRows(result.productDefinitions);
      })
      .catch((err: unknown) => {
        setError(String(err));
      });
  }, []);

  return (
    <Page pageId="product-definition-list">
      <PageTitle>Termékek</PageTitle>
      <PageActionBar>
        <ActionBarItem itemId="create-product-definition">
          <DetailPageButton href="/product-definitions/new" label="Új termék" />
        </ActionBarItem>
      </PageActionBar>
      <PageLayout>
        <PageBlock
          column="main"
          blockId="product-definition-list"
          title="Termékek"
          description="A strukturált konfigurátorból generált termékek. Létrehozás és törlés itt történik; szerkesztés a termék oldalán."
        >
          {error !== null && <ErrorNotice message={error} />}
          {rows.length === 0 && <p className="text-sm">Még nincs egy termék sem.</p>}
          {rows.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">Azonosító</th>
                  <th className="py-2 pr-4 font-medium">Név</th>
                  <th className="py-2 pr-4 font-medium">Alapár</th>
                  <th className="py-2 pr-4 font-medium">Szinkron</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.productId} className="border-b">
                    <td className="py-2 pr-4 font-mono text-xs">{row.productId}</td>
                    <td className="py-2 pr-4">
                      <DetailPageButton
                        href={`/product-definitions/${row.productId}`}
                        label={row.label}
                      />
                    </td>
                    <td className="py-2 pr-4">{row.basePrice} Ft</td>
                    <td className="py-2 pr-4">
                      <SyncBadge state={row.syncState} stale={row.stale} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </PageBlock>
      </PageLayout>
    </Page>
  );
}

/** Numeric text input: types freely, commits the parsed value. */
function NumberInput({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}): ReactElement {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText((current) => (Number(current) === value ? current : String(value)));
  }, [value]);

  return (
    <Input
      type="number"
      className={className}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        const parsed = Number(raw);

        if (raw.trim() !== "" && !Number.isNaN(parsed)) {
          onChange(parsed);
        }
      }}
    />
  );
}

/** The configurator editor shared by the standalone Termékek detail page and
 * the embedded stock product-detail block. Renders PageLayout content only;
 * `standalone` adds the page title and delete. */
function ConfiguratorEditor({
  definitionId,
  mode,
}: {
  definitionId: string;
  mode: "standalone" | "embedded";
}): ReactElement {
  const navigate = useNavigate();
  const creatingNew =
    mode === "standalone" && (definitionId === "" || definitionId === NEW_ENTITY_PATH);

  const [definition, setDefinition] = useState<ProductDefinitionInput | null>(null);
  const [rows, setRows] = useState<FieldRow[]>([]);
  const [banned, setBanned] = useState<string[][]>([]);
  const [materialOptions, setMaterialOptions] = useState<Array<{ slug: string; label: string }>>(
    []
  );
  const [newId, setNewId] = useState("");
  const [sync, setSync] = useState<{ state: string; error: string | null; stale: boolean } | null>(
    null
  );
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [driftConflict, setDriftConflict] = useState(false);
  const [variantPage, setVariantPage] = useState(1);
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
      setDefinition(null);
      setRows([]);
      setBanned([]);
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
  }, [creatingNew, definitionId]);

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
    setRows((current) =>
      current.map((row) => {
        if (row.key !== key) {
          return row;
        }

        return { key: rowKey(), field: newField(kind, row.field.id, row.field.label) };
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

  /** Polls the definition until the queued sync settles. */
  async function pollSync(productId: string): Promise<void> {
    const run = ++pollRun.current;

    while (pollRun.current === run) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      if (pollRun.current !== run) {
        return;
      }

      const result = await api.query(productDefinitionQuery, { productId });

      if (result.productDefinition === null) {
        return;
      }

      setSync({
        state: result.productDefinition.syncState,
        error: result.productDefinition.syncError,
        stale: result.productDefinition.stale,
      });

      if (result.productDefinition.syncState !== "pending") {
        return;
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

    const payload = sanitize({
      ...definition,
      id: creatingNew ? newId.trim() : definition.id,
      fields: rows.map((row) => row.field),
      forbiddenMaterialCombinations: banned,
    });

    let validated: ProductDefinitionInput;

    try {
      validated = ProductDefinitionSchema.parse(payload);
    } catch (error: unknown) {
      const issues =
        typeof error === "object" && error !== null && "issues" in error
          ? (error.issues as Array<{ path: Array<string | number | symbol>; message: string }>)
          : [];

      setErrors(issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
      return;
    }

    setPending(true);

    try {
      if (creatingNew) {
        const result = await api.query(createProductDefinitionMutation, { definition: validated });
        await navigate({
          to: "/product-definitions/$id",
          params: { id: result.createProductDefinition.productId },
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

      if (message.includes("natív adatai")) {
        setDriftConflict(true);
      }
    } finally {
      setPending(false);
    }
  }

  async function remove(): Promise<void> {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setPending(true);

    try {
      await api.query(deleteProductDefinitionMutation, { productId: definitionId });
      await navigate({ to: "/product-definitions" });
    } catch (err: unknown) {
      setErrors(err instanceof Error ? err.message.split("\n") : [String(err)]);
      setPending(false);
    }
  }

  if (creatingNew) {
    return (
      <>
        <PageTitle>Új termék</PageTitle>
        <PageLayout>
          <PageBlock
            column="main"
            blockId="product-definition-create"
            title="Új termék"
            description="A mentés létrehozza a natív terméket, és a szinkronizálás a háttérben előállítja az opciócsoportokat és a variánsokat."
          >
            <label className="flex flex-col gap-1 text-sm">
              <span>Azonosító</span>
              <Input
                className="w-64"
                value={newId}
                onChange={(e) => {
                  setNewId(e.target.value);
                }}
              />
            </label>
            {errors !== null && <ErrorNotice message={errors.join("\n")} />}
            <div>
              <Button
                type="button"
                disabled={pending || newId.trim() === ""}
                onClick={() => {
                  void save(false);
                }}
              >
                Létrehozás
              </Button>
            </div>
          </PageBlock>
        </PageLayout>
      </>
    );
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

  return (
    <>
      {mode === "standalone" && <PageTitle>{definition.label}</PageTitle>}
      <PageLayout>
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
              Mentés
            </Button>
            {mode === "standalone" && (
              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={() => {
                  void remove();
                }}
              >
                {confirmDelete ? "Biztos? Kattints újra" : "Törlés"}
              </Button>
            )}
            {sync !== null && <SyncBadge state={sync.state} stale={sync.stale} />}
          </div>
          {errors !== null && <ErrorNotice message={errors.join("\n")} />}
          {driftConflict && (
            <Alert variant="destructive">
              <AlertTitle>
                A natív termék a szinkronizáláson kívül módosult (kézi ár- vagy névváltoztatás). A
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
          {sync?.state === "failed" && sync.error !== null && (
            <ErrorNotice message={`A szinkronizálás sikertelen: ${sync.error}`} />
          )}

          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span>Azonosító</span>
              <span className="font-mono text-xs">{definition.id}</span>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Típus</span>
              <span className="text-xs">{definition.type}</span>
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
              <input
                type="checkbox"
                checked={definition.orderable}
                onChange={(e) => {
                  setDefinition({ ...definition, orderable: e.target.checked });
                }}
              />
              <span>Rendelhető</span>
            </label>
            {lengthPricing !== null && (
              <p className="text-muted-foreground text-xs">{lengthPricing}</p>
            )}
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
                    <select
                      className="h-9 w-52 rounded border bg-transparent px-2 text-sm"
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
                    </select>
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
              transformQueryKey={(queryKey) => [...queryKey, definitionId]}
              transformVariables={(variables) => ({
                productDefinitionId: definitionId,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- under the repo's TS 6 (eslint's parser) the PaginatedListDataTable generics fall back to `any`; tsc 5.9 (check:dashboard, the gate for dashboard extensions) type-checks this concretely and passes
                options: variables.options,
              })}
              page={variantPage}
              itemsPerPage={20}
              sorting={variantSorting}
              onPageChange={(_table, page) => {
                setVariantPage(page);
              }}
              onSortChange={(_table, sorting) => {
                setVariantSorting(sorting);
              }}
              customizeColumns={{
                id: { header: "ID", enableSorting: false },
                name: { header: "Név", enableSorting: false },
                sku: { header: "SKU", enableSorting: false },
                price: { header: "Ár", enableSorting: false },
              }}
            />
          </div>
        </PageBlock>
      </PageLayout>
    </>
  );
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
          <select
            className="h-9 rounded border bg-transparent px-2 text-sm"
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
          </select>
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
            <select
              className="h-9 rounded border bg-transparent px-2 text-sm"
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
            </select>
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
              <input
                type="checkbox"
                checked={field.required}
                onChange={(e) => {
                  patchInputField(row.key, { required: e.target.checked });
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
              <select
                className="h-9 rounded border bg-transparent px-2 text-sm"
                value={field.pricing.kind}
                onChange={(e) => {
                  const kind = EMBROIDERY_PRICINGS.find(
                    (candidate) => candidate === e.target.value
                  );

                  if (kind === undefined) {
                    return;
                  }

                  patchEmbroidery(row.key, {
                    pricing:
                      kind === "per-word"
                        ? { kind: "per-word", pricePerWord: 0 }
                        : { kind: "flat", price: 0 },
                  });
                }}
              >
                {EMBROIDERY_PRICINGS.map((kind) => (
                  <option key={kind} value={kind}>
                    {EMBROIDERY_PRICING_LABELS[kind]}
                  </option>
                ))}
              </select>
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
                <select
                  className="h-9 w-52 rounded border bg-transparent px-2 text-sm"
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
                </select>
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
 * the configurator editor in place. */
function ProductConfiguratorBlock({ context }: { context: PageContextValue }): ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- PageContextValue.entity is typed `any` by the dashboard's own contract (page-provider.tsx); there is no typed alternative for extension blocks
  const nativeProductId = Number(context.entity?.id);
  const [definitionId, setDefinitionId] = useState<string | null>(null);
  const [lookedUp, setLookedUp] = useState(false);

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
      .catch((err: unknown) => {
        setLookedUp(true);
        console.error(err);
      });
  }, [nativeProductId]);

  if (!Number.isInteger(nativeProductId) || nativeProductId <= 0) {
    return <></>;
  }

  if (!lookedUp) {
    return <></>;
  }

  if (definitionId === null) {
    return (
      <p className="text-muted-foreground text-sm">
        Ez a termék nem strukturált konfigurátorból lett generálva — definíció a Termékek szekcióból
        hozható létre hozzá.
      </p>
    );
  }

  return <ConfiguratorEditor definitionId={definitionId} mode="embedded" />;
}

function ErrorNotice({ message }: { message: string }): ReactElement {
  return (
    <Alert variant="destructive">
      <AlertTitle className="whitespace-pre-wrap">{message}</AlertTitle>
    </Alert>
  );
}
