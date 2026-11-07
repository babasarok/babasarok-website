/**
 * The shared configurator editor: edits the canonical definition in its input
 * shape and re-validates it with the canonical schema on save; the server
 * re-derives the native option groups/variants via the queued sync, whose
 * state and staleness the SyncBadge surfaces. Both modes render their
 * sections bare (no cards of their own) inside the wrapper card the stock
 * page's block system provides: create mode sits at the bottom of the stock
 * new-product page, embedded mode at the bottom of the stock product page.
 *
 * Type-checked by src/dashboard/tsconfig.json (`check:dashboard`); at build
 * time the dashboard's vite pipeline bundles this file. The typed graphql
 * documents come from the backend's generated schema (src/gql).
 */
import { Fragment, useEffect, useRef, useState, type ReactElement } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Alert,
  AlertTitle,
  api,
  Badge,
  Button,
  ConfirmationDialog,
  NEW_ENTITY_PATH,
  NativeSelect,
  PaginatedListDataTable,
  PageBlock,
  StatusBadge,
  toast,
  useUserSettings,
} from "@vendure/dashboard";
import { defineStateEntries } from "@vendure/dashboard";
import type { PageContextValue } from "@vendure/dashboard";
import type { LanguageCode } from "@vendure/common/lib/generated-types";
import {
  ProductDefinitionSchema,
  type ProductDefinitionInput,
} from "../../shared/product-definition/index";
import { graphql } from "@/gql";
import { UnsavedChangesGuard } from "./unsaved-changes-guard";
import { ErrorNotice, errorCodeOf, rowKey } from "../shared";
import "./stock-image-sizes.css";
import { FieldEditor, NumberInput } from "./product-definition-fields";
import {
  publishConfiguratorSave,
  unpublishConfiguratorSave,
} from "./product-definition-save-store";
import {
  applyLengthSourceDefaults,
  assignGeneratedIds,
  carryOver,
  colorCountValueErrors,
  hasEditableData,
  lengthSourceCandidates,
  lengthSourceValueErrors,
  loadBearingFieldIds,
  newDefinition,
  newField,
  pricingMode,
  sanitize,
  textValue,
  withLengthSourcePattern,
  withPricingMode,
  FIELD_KINDS,
  FIELD_KIND_LABELS,
  type FieldInput,
  type FieldKind,
  type FieldRow,
  type PricingMode,
} from "./product-definition-editor";

const productDefinitionQuery = graphql(`
  query ProductDefinition($productId: String!) {
    productDefinition(productId: $productId) {
      productId
      basePrice
      nativeProductId
      syncState
      syncError
      syncProgress {
        done
        total
      }
      stale
      driftDetails {
        kind
        label
      }
      definition
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
  mutation CreateProductDefinition($definition: JSON!, $name: String!) {
    createProductDefinition(definition: $definition, name: $name) {
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

/** Carries the stock new-product form's values (enabled, description, custom
 * fields, media, facet values) onto the product the definition just created. */
const patchCreatedProductMutation = graphql(`
  mutation PatchCreatedProduct($input: UpdateProductInput!) {
    updateProduct(input: $input) {
      id
    }
  }
`);

const generatedVariantsQuery = graphql(`
  query GeneratedVariants($productDefinitionId: String!, $options: GeneratedVariantListOptions!) {
    generatedVariants(productDefinitionId: $productDefinitionId, options: $options) {
      items {
        id
        name
        code
        price
        facets
      }
      totalItems
    }
  }
`);

interface SyncInfo {
  state: string;
  error: string | null;
  stale: boolean;
  details: Array<{ kind: string; label: string }>;
  progress: { done: number; total: number } | null;
}

const syncStateDictionary = defineStateEntries({
  pending: { tone: "progress", defaultLabel: "Szinkronizálás…" },
  synced: { tone: "success", defaultLabel: "Szinkronizálva" },
  failed: { tone: "critical", defaultLabel: "Szinkronizálás sikertelen" },
});

function SyncBadge({ sync }: { sync: SyncInfo | null }): ReactElement {
  if (sync === null) {
    return <></>;
  }

  const baseLabel = syncStateDictionary.labelFor(sync.state);
  const stateLabel =
    sync.state === "pending" && sync.progress !== null
      ? `${baseLabel} ${sync.progress.done} / ${sync.progress.total}`
      : baseLabel;

  return (
    <span className="flex items-center gap-2">
      <StatusBadge tone={syncStateDictionary.toneFor(sync.state)} dot={sync.state === "pending"}>
        {stateLabel}
      </StatusBadge>
      {sync.stale && sync.state !== "pending" && (
        <Badge variant="warning">
          Elavult — mentés csak a natív módosítások felülírásával lehetséges
        </Badge>
      )}
    </span>
  );
}

function snapshotOf(
  definition: ProductDefinitionInput,
  fields: FieldRow["field"][],
  banned: string[][]
): string {
  return JSON.stringify({ ...definition, fields, forbiddenMaterialCombinations: banned });
}

function optionsCarryData(field: FieldInput): boolean {
  if (field.kind === "choice") {
    return (
      field.customValue !== undefined ||
      field.options.some((option) => option.price !== 0 || option.tooltip !== undefined)
    );
  }

  if (field.kind === "material") {
    return field.options.some((option) => option.price !== 0);
  }

  return false;
}

/** The stock form's translatable values for the dashboard's content language. */
interface StockTranslation {
  languageCode: string;
  name?: string | null;
  slug?: string | null;
  description?: string | null;
  customFields?: Record<string, unknown> | null;
}

/** The stock create form's values the patch carries onto the created
 * product: CreateProductInput-shaped, so the fields UpdateProductInput
 * accepts pass through verbatim. PageContextValue.form is typed `any` by the
 * dashboard's own contract (page-provider.tsx), which is why the read needs
 * one boundary cast. */
interface StockCreateValues {
  enabled?: boolean;
  featuredAssetId?: string | null;
  assetIds?: string[] | null;
  facetValueIds?: string[] | null;
  customFields?: {
    popularityRank?: number | null;
    iconId?: string | null;
    date?: string | null;
  } | null;
}

/** Recursively turns empty strings into null and drops null- and
 * undefined-valued keys: the patch must not send "" to Int/ID-ish custom
 * fields, and omitted keys mean "no change" for the freshly created product. */
function cleanedPatchEntry(value: unknown): unknown {
  if (typeof value === "string") {
    return value === "" ? null : value;
  }

  if (Array.isArray(value)) {
    return value.map(cleanedPatchEntry);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .map(([key, entry]) => [key, cleanedPatchEntry(entry)])
        .filter(([, entry]) => entry !== null && entry !== undefined)
    );
  }

  return value;
}

/** The entry-point wrapper keeps the caller's object type; the recursion
 * above erases it because it walks `unknown`. The transform is
 * structure-preserving, so the cast only restores what it started as. */
function cleanedPatchValue<T extends object>(value: T): T {
  return cleanedPatchEntry(value) as T;
}

export function ConfiguratorEditor({
  definitionId,
  mode,
  pageForm,
}: {
  definitionId: string;
  mode: "create" | "embedded";
  /** The stock page's react-hook-form instance; create mode reads the native
   * product's name/slug from it and patches the remaining values after the
   * definition create. */
  pageForm?: PageContextValue["form"];
}): ReactElement {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const creatingNew = mode === "create";

  const [definition, setDefinition] = useState<ProductDefinitionInput | null>(() =>
    creatingNew ? newDefinition("") : null
  );
  const language = useUserSettings().settings.contentLanguage;
  const [rows, setRows] = useState<FieldRow[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [detailsOverrides, setDetailsOverrides] = useState<Record<string, boolean | undefined>>({});
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
        setSavedFields(parsed.fields);
        setBanned(parsed.forbiddenMaterialCombinations.map((rule) => [...rule]));
        setBaseline(
          snapshotOf(
            parsed,
            parsed.fields,
            parsed.forbiddenMaterialCombinations.map((rule) => [...rule])
          )
        );
        setSync({
          state: result.productDefinition.syncState,
          error: result.productDefinition.syncError,
          stale: result.productDefinition.stale,
          details: result.productDefinition.driftDetails ?? [],
          progress: result.productDefinition.syncProgress,
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

  const [baseline, setBaseline] = useState<string | null>(null);
  const [savedFields, setSavedFields] = useState<FieldInput[]>([]);
  const liveFields = rows.map((row) => row.field);
  const snapshot = definition === null ? null : snapshotOf(definition, liveFields, banned);
  const configuratorDirty = !creatingNew && snapshot !== null && snapshot !== baseline;

  // Create mode's guard: any configurator content the stock page's own
  // unsaved-changes guard cannot see. The definition is pristine until one of
  // its defaults changes (base price, pricing mode, orderable, hidden).
  const dirty =
    creatingNew &&
    definition !== null &&
    (rows.length > 0 ||
      banned.length > 0 ||
      JSON.stringify(definition) !== JSON.stringify(newDefinition("")));

  const blocksLeaving = (): boolean => !pending && (creatingNew ? dirty : configuratorDirty);

  // The unified save button reads this handle: on generated products it saves
  // the configurator alongside the page form, and in create mode it is the
  // whole create flow (definition create + stock-value patch).
  const saveHandleKey = creatingNew ? NEW_ENTITY_PATH : definitionId;

  useEffect(() => {
    publishConfiguratorSave(saveHandleKey, {
      dirty: creatingNew ? dirty : configuratorDirty,
      save: async () => {
        if (pending) {
          return;
        }

        await save(false);
      },
    });
  });

  useEffect(() => {
    return () => {
      unpublishConfiguratorSave(saveHandleKey);
    };
  }, [saveHandleKey]);

  function setField(key: string, field: FieldInput): void {
    setRows((current) => {
      const previous = current.find((row) => row.key === key)?.field;
      const colorCountSourceId =
        previous?.kind === "material" &&
        field.kind === "material" &&
        field.colorCount.kind === "from-field" &&
        (previous.colorCount.kind !== "from-field" ||
          previous.colorCount.fieldId !== field.colorCount.fieldId)
          ? field.colorCount.fieldId
          : undefined;

      return current.map((row) => {
        if (row.key === key) {
          return { ...row, field };
        }

        if (colorCountSourceId !== undefined && row.field.id === colorCountSourceId) {
          return { ...row, field: withLengthSourcePattern(row.field) };
        }

        return row;
      });
    });
  }

  function addField(kind: FieldKind): void {
    const key = rowKey();

    setRows((current) => [...current, { key, field: newField(kind, "", { hu: "" }) }]);
    setExpandedKeys((current) => {
      const next = new Set(current);

      next.add(key);

      return next;
    });
  }

  function changeFieldKind(key: string, kind: FieldKind): void {
    const row = rows.find((candidate) => candidate.key === key);

    if (row === undefined || row.field.kind === kind) {
      return;
    }

    if (hasEditableData(row.field)) {
      setKindSwitchKey({ key, kind, label: row.field.label.hu });
      return;
    }

    applyKindSwitch(key, kind);
  }

  function applyKindSwitch(key: string, kind: FieldKind): void {
    const nextKey = rowKey();

    setRows((current) =>
      current.map((row) => {
        if (row.key !== key) {
          return row;
        }

        return {
          key: nextKey,
          field: carryOver(newField(kind, row.field.id, row.field.label), row.field),
        };
      })
    );
    setExpandedKeys((current) => {
      if (!current.has(key)) {
        return current;
      }

      const next = new Set(current);

      next.delete(key);
      next.add(nextKey);

      return next;
    });
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

  function changePricingMode(mode: PricingMode): void {
    if (definition === null) {
      return;
    }

    const next = withPricingMode(definition, mode);

    if (next.pricing.kind !== "length") {
      setDefinition(next);
      return;
    }

    adoptLengthSource(next, next.pricing.sourceFieldId);
  }

  function changeLengthSource(sourceFieldId: string): void {
    if (definition === null) {
      return;
    }

    adoptLengthSource(withPricingMode(definition, "length", sourceFieldId), sourceFieldId);
  }

  function adoptLengthSource(base: ProductDefinitionInput, sourceFieldId: string): void {
    const defaulted = applyLengthSourceDefaults(
      { ...base, fields: rows.map((row) => row.field) },
      sourceFieldId
    );

    setDefinition(base);
    setRows((current) => current.map((row, index) => ({ ...row, field: defaulted.fields[index] })));
  }

  function toggleExpandAll(): void {
    setExpandedKeys((current) => {
      if (rows.every((row) => current.has(row.key))) {
        return new Set();
      }

      return new Set(rows.map((row) => row.key));
    });
  }

  function changeExpanded(key: string, expanded: boolean): void {
    setExpandedKeys((current) => {
      const next = new Set(current);

      if (expanded) {
        next.add(key);
      } else {
        next.delete(key);
      }

      return next;
    });
  }

  function toggleDetails(key: string, reveal: boolean): void {
    setDetailsOverrides((current) => ({ ...current, [key]: reveal }));
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
          details: result.productDefinition.driftDetails ?? [],
          progress: result.productDefinition.syncProgress,
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
              : { ...current, error: "Az állapot lekérése nem sikerült — újrapróbálkozás…" }
          );
        }
      }
    }
  }

  /** The stock form's translatable values for the dashboard's content
   * language. PageContextValue.form is typed `any` by the dashboard's own
   * contract (page-provider.tsx), so the reads are narrowed here. */
  function stockTranslation(): StockTranslation | undefined {
    if (pageForm === undefined) {
      return undefined;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any -- PageContextValue.form is typed `any` by the dashboard's own contract (page-provider.tsx)
    const translations: any[] | undefined = pageForm.getValues("translations");

    if (!Array.isArray(translations)) {
      return undefined;
    }

    const isForLanguage = (candidate: unknown): candidate is StockTranslation =>
      typeof candidate === "object" &&
      candidate !== null &&
      "languageCode" in candidate &&
      candidate.languageCode === language;

    return translations.find(isForLanguage);
  }

  async function save(force: boolean): Promise<void> {
    if (definition === null) {
      return;
    }

    setErrors(null);
    setSaved(false);
    setDriftConflict(false);

    const stock = creatingNew ? stockTranslation() : undefined;
    const productName = (stock?.name ?? "").trim();
    const slug = creatingNew ? (stock?.slug ?? "").trim() : definition.id;

    // The rows and banned pairs are the editor's authoritative state (the
    // definition state only carries the load-time values), so the payload
    // serializes from them — otherwise every field edit would be dropped.
    // Blank codes are generated from the labels here; see assignGeneratedIds.
    // In create mode the id is the stock form's slug (the native slug is
    // seeded from it; ADR 0011 decision 1).
    const payload = assignGeneratedIds(
      sanitize({
        ...definition,
        id: creatingNew ? slug : definition.id,
        fields: rows.map((row) => row.field),
        forbiddenMaterialCombinations: banned.map((rule) => [...rule]),
      })
    );
    const clientErrors: string[] = [];

    if (creatingNew && (slug === "" || productName === "")) {
      clientErrors.push("A terméknév és a slug megadása a natív termékűrlapon kötelező.");
    }

    if (creatingNew && slug === NEW_ENTITY_PATH) {
      clientErrors.push("Az azonosító nem lehet „new”.");
    }

    if (clientErrors.length > 0) {
      setErrors(clientErrors);
      return;
    }

    // The canonical schema is the single validation authority; the server
    // re-runs it (plus its own duplicate and price checks) and its errors
    // render readably below.
    const parsed = ProductDefinitionSchema.safeParse(payload);

    if (!parsed.success) {
      setErrors(parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`));
      return;
    }

    const validated = parsed.data;

    setPending(true);

    try {
      if (creatingNew) {
        const result = await api.query(createProductDefinitionMutation, {
          definition: validated,
          name: productName,
        });
        const created = result.createProductDefinition;

        if (created.nativeProductId === null) {
          setErrors(["A termék létrejött, de a natív termék megnyitása nem sikerült."]);
          return;
        }

        const nativeId = String(created.nativeProductId);

        // The stock form's remaining values (enabled, description, custom
        // fields, media, facet values) ride onto the created product in a
        // second, best-effort write: the product and the definition exist at
        // this point, so a failure here must not block the navigation — the
        // fields are editable on the product page afterwards.
        if (pageForm !== undefined) {
          try {
            const values = pageForm.getValues() as StockCreateValues;
            const input = cleanedPatchValue({
              enabled: values.enabled,
              featuredAssetId: values.featuredAssetId,
              assetIds: values.assetIds,
              facetValueIds: values.facetValueIds,
              customFields: values.customFields,
              translations: [
                {
                  // The dashboard's contentLanguage is typed `string`, the
                  // admin API's translation input wants the LanguageCode
                  // enum: the narrowing is safe (both come from the same
                  // schema's language list) but not expressible without a
                  // cast.
                  languageCode: language as unknown as LanguageCode,
                  name: productName,
                  slug: stock?.slug,
                  description: stock?.description,
                  customFields: stock?.customFields,
                },
              ],
            });

            await api.query(patchCreatedProductMutation, {
              input: { ...input, id: nativeId },
            });
          } catch {
            toast.error(
              "A termék létrejött, de a megjelenítési mezők (leírás, tulajdonságok, média) mentése nem sikerült — a termékoldalon pótolhatók.",
              { duration: 10_000 }
            );
          }
        }

        await navigate({
          to: "/products/$id",
          params: { id: nativeId },
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
          details: [],
          progress: null,
        });
        // Adopt the saved payload (with the generated codes filled in) so the
        // next save keeps them stable instead of regenerating from labels.
        setRows((current) =>
          current.map((row, index) => ({ ...row, field: validated.fields[index] }))
        );
        setSavedFields(validated.fields);
        setBaseline(snapshotOf(definition, validated.fields, banned));
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

  const live: ProductDefinitionInput = { ...definition, fields: liveFields };
  const loadBearing = loadBearingFieldIds(live);
  const sourceValueErrors = lengthSourceValueErrors(live);
  const colorCountValueErrorList = colorCountValueErrors(live);
  const sourceFieldId = live.pricing.kind === "length" ? live.pricing.sourceFieldId : undefined;
  const numericSourceFieldIds = new Set<string>([
    ...(sourceFieldId !== undefined && sourceFieldId !== "" ? [sourceFieldId] : []),
    ...live.fields.flatMap((field) =>
      field.kind === "material" &&
      field.colorCount.kind === "from-field" &&
      field.colorCount.fieldId !== ""
        ? [field.colorCount.fieldId]
        : []
    ),
  ]);

  function revealDetails(row: FieldRow): boolean {
    const override = detailsOverrides[row.key];

    if (override !== undefined) {
      return override;
    }

    return loadBearing.has(row.field.id) || optionsCarryData(row.field);
  }

  const editor = (
    <>
      <PageBlock column="main" layout="bare">
        <div className="flex flex-wrap items-center gap-3">
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
        {sync?.stale === true && sync.details.length > 0 && (
          <ul className="text-muted-foreground max-h-40 space-y-1 overflow-y-auto text-xs">
            {sync.details.map((drift) => (
              <li key={drift.label}>{drift.label}</li>
            ))}
          </ul>
        )}
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
                Natív módosítások felülírása
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
              "\nA szinkronizálás a következő mentéskor újraindul — szüntesd meg a hiba okát, majd mentsd újra."
            }
          />
        )}

        <fieldset disabled={pending} className="flex flex-col gap-4">
          {!creatingNew && (
            <label className="flex flex-col gap-1 text-sm">
              <span>Azonosító</span>
              <span className="font-mono text-xs wrap-anywhere">{definition.id}</span>
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span>Alapár (Ft)</span>
            <NumberInput
              className="w-full max-w-40"
              value={definition.basePrice}
              onChange={(basePrice) => {
                setDefinition({ ...definition, basePrice });
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span>Árazási mód</span>
            <NativeSelect
              value={pricingMode(definition)}
              onChange={(e) => {
                changePricingMode(e.target.value === "length" ? "length" : "unit");
              }}
            >
              <option value="unit">Darabáras</option>
              <option value="length">Méteráras</option>
            </NativeSelect>
          </label>
          {definition.pricing.kind === "length" && (
            <label className="flex flex-col gap-1 text-sm">
              <span>Forrásmező</span>
              <NativeSelect
                className="w-full max-w-52"
                value={definition.pricing.sourceFieldId}
                onChange={(e) => {
                  changeLengthSource(e.target.value);
                }}
              >
                <option value="">Válassz forrásmezőt…</option>
                {lengthSourceCandidates(live).map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {textValue(candidate.label, language)} ({candidate.id})
                  </option>
                ))}
              </NativeSelect>
              <span className="text-muted-foreground text-xs">
                Az alapár és a mezőárak adják az Ft/m egységárat; a forrásmező saját árai figyelmen
                kívül maradnak.
              </span>
            </label>
          )}
        </fieldset>
      </PageBlock>
      <PageBlock column="main" layout="bare">
        <div className="mb-4 flex items-start justify-between gap-2">
          <div className="grid flex-1 gap-1">
            <div className="text-style-card-title">Mezők</div>
            <div className="text-muted-foreground text-sm">
              Minden választó, kapcsoló és anyagmező natív opciócsoportot és változatokat generál; a
              szabad szöveg és a hímzés értéke a rendelési sorokon tárolódik.
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Összes kibontása/összecsukása"
            title="Összes kibontása/összecsukása"
            onClick={toggleExpandAll}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m7 15 5 5 5-5" />
              <path d="m7 9 5-5 5 5" />
            </svg>
          </Button>
        </div>
        <fieldset disabled={pending} className="flex flex-col gap-4">
          {rows.map((row, index) => (
            <Fragment key={row.key}>
              <FieldEditor
                row={row}
                index={index}
                count={rows.length}
                materialOptions={materialOptions}
                language={language}
                changeFieldKind={changeFieldKind}
                removeField={removeField}
                moveField={moveField}
                expanded={expandedKeys.has(row.key)}
                onExpandedChange={changeExpanded}
                revealDetails={revealDetails(row)}
                onDetailsToggle={toggleDetails}
                sourceFieldId={sourceFieldId}
                sourceValueErrors={sourceValueErrors
                  .filter((error) => error.fieldId === row.field.id)
                  .map((error) => error.message)}
                colorCountErrors={colorCountValueErrorList
                  .filter((error) => error.fieldId === row.field.id)
                  .map((error) => error.message)}
                isNumericSource={numericSourceFieldIds.has(row.field.id)}
                baselineFieldId={
                  savedFields.find((candidate) => candidate.id === row.field.id)?.id ?? ""
                }
                fields={liveFields}
                savedFields={savedFields}
                setField={setField}
              />
              {kindSwitchKey?.key === row.key && (
                <Alert variant="destructive">
                  <AlertTitle>
                    A(z) „{kindSwitchKey.label}” mezőhöz tartozó adatok (opciók, árak, beállítások)
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
            </Fragment>
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
        </fieldset>
      </PageBlock>
      <PageBlock
        column="main"
        layout="bare"
        title="Tiltott anyagkombinációk"
        description="Az itt felsorolt anyagpárok (akkor is, ha ugyanaz az anyag kétszer szerepel) nem fordulhatnak elő együtt egy választásban."
      >
        <fieldset disabled={pending} className="flex flex-col gap-2">
          {banned.map((rule, index) => (
            <div key={index} className="flex flex-wrap items-end gap-2">
              {rule.map((materialId, memberIndex) => (
                <label key={memberIndex} className="flex flex-col gap-1 text-sm">
                  <span>{memberIndex + 1}. anyag</span>
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
        </fieldset>
      </PageBlock>
      {!creatingNew && (
        <PageBlock
          column="main"
          layout="bare"
          title="Generált natív szerkezet"
          description="A szinkronizálással előállított natív opciócsoportok és változatok."
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
                // The variant's SKU arrives as "code": a column literally
                // named "sku" collides with the product-detail page's shipped
                // table settings (the stock variants table hides it by
                // default) and would render hidden with an unfetched value.
                code: { header: "SKU", enableSorting: false },
                price: { header: "Ár (Ft)", enableSorting: false },
                facets: { header: "Tulajdonságok", enableSorting: false },
              }}
            />
          </div>
        </PageBlock>
      )}
    </>
  );

  // Both modes render bare blocks: create mode sits inside the stock
  // new-product page's PageLayout (the block API wraps it), embedded mode in
  // the stock product page's full-width row.
  return (
    <div className="space-y-4">
      <UnsavedChangesGuard blocks={blocksLeaving} />
      {editor}
    </div>
  );
}
