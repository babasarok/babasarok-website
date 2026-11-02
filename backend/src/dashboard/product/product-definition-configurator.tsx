/**
 * The shared configurator editor: edits the canonical definition in its input
 * shape and re-validates it with the canonical schema on save; the server
 * re-derives the native option groups/variants via the queued sync, whose
 * state and staleness the SyncBadge surfaces. Create mode renders a PageLayout;
 * embedded mode renders its blocks bare so the stock page's full-width block
 * row sizes them.
 *
 * Type-checked by src/dashboard/tsconfig.json (`check:dashboard`); at build
 * time the dashboard's vite pipeline bundles this file. The typed graphql
 * documents come from the backend's generated schema (src/gql).
 */
import { Fragment, useEffect, useRef, useState, type ReactElement } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import {
  Alert,
  AlertTitle,
  api,
  Badge,
  Button,
  ConfirmationDialog,
  Input,
  NEW_ENTITY_PATH,
  NativeSelect,
  PaginatedListDataTable,
  PageBlock,
  PageLayout,
  StatusBadge,
  useUserSettings,
} from "@vendure/dashboard";
import { defineStateEntries } from "@vendure/dashboard";
import {
  ProductDefinitionSchema,
  type ProductDefinitionInput,
} from "@babasarok/product-definition";
import { graphql } from "@/gql";
import { Switch } from "@/vdb/components/ui/switch.js";
import { ErrorNotice, errorCodeOf, rowKey } from "../shared";
import "./stock-image-sizes.css";
import { FieldEditor, NumberInput } from "./product-definition-fields";
import {
  publishConfiguratorSave,
  unpublishConfiguratorSave,
} from "./product-definition-save-store";
import {
  assignGeneratedIds,
  carryOver,
  hasEditableData,
  newDefinition,
  newField,
  type TextInput,
  sanitize,
  FIELD_KINDS,
  FIELD_KIND_LABELS,
  type ChoiceFieldInput,
  type ChoiceOptionInput,
  type EmbroideryFieldInput,
  type FieldKind,
  type FieldRow,
  type InputFieldInput,
  type MaterialFieldInput,
  type MaterialOptionInput,
  type ToggleFieldInput,
} from "./product-definition-editor";

const productDefinitionQuery = graphql(`
  query ProductDefinition($productId: String!) {
    productDefinition(productId: $productId) {
      productId
      orderable
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
          Elavult — a mentés a natív módosítások felülírása nélkül elutasított
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

export function ConfiguratorEditor({
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
    creatingNew ? newDefinition("") : null
  );
  // The native Product's name (ADR 0011 decision 1): asked for at creation,
  // afterwards edited on the stock product form, never in this editor.
  const [name, setName] = useState("");
  const language = useUserSettings().settings.contentLanguage;
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
  const snapshot =
    definition === null
      ? null
      : snapshotOf(
          definition,
          rows.map((row) => row.field),
          banned
        );
  const configuratorDirty = !creatingNew && snapshot !== null && snapshot !== baseline;

  const dirty =
    definition !== null &&
    (definition.id !== "" || (creatingNew && name !== "") || rows.length > 0 || banned.length > 0);

  // Guards only the create route: the embedded block shares the stock
  // product page's navigation, where blocking is too broad a blast radius.
  useBlocker({
    shouldBlockFn: () => mode === "create" && !pending && dirty,
  });

  useEffect(() => {
    if (creatingNew) {
      return;
    }

    publishConfiguratorSave(definitionId, {
      dirty: configuratorDirty,
      save: async () => {
        if (pending) {
          return;
        }

        await save(false);
      },
    });
  });

  useEffect(() => {
    if (creatingNew) {
      return;
    }

    return () => {
      unpublishConfiguratorSave(definitionId);
    };
  }, [creatingNew, definitionId]);

  function patchBase(key: string, label: TextInput): void {
    setRows((current) =>
      current.map((row) => (row.key === key ? { ...row, field: { ...row.field, label } } : row))
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
    setRows((current) => [...current, { key: rowKey(), field: newField(kind, "", { hu: "" }) }]);
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

    // The rows and banned pairs are the editor's authoritative state (the
    // definition state only carries the load-time values), so the payload
    // serializes from them — otherwise every field edit would be dropped.
    // Blank codes are generated from the labels here; see assignGeneratedIds.
    const payload = assignGeneratedIds(
      sanitize({
        ...definition,
        fields: rows.map((row) => row.field),
        forbiddenMaterialCombinations: banned.map((rule) => [...rule]),
      })
    );
    const clientErrors: string[] = [];
    const productName = name.trim();

    if (creatingNew && (payload.id === "" || productName === "")) {
      clientErrors.push("Az azonosító és a név is kötelező.");
    }

    if (creatingNew && payload.id === NEW_ENTITY_PATH) {
      clientErrors.push('Az azonosító nem lehet "new".');
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
          details: [],
          progress: null,
        });
        // Adopt the saved payload (with the generated codes filled in) so the
        // next save keeps them stable instead of regenerating from labels.
        setRows((current) =>
          current.map((row, index) => ({ ...row, field: validated.fields[index] }))
        );
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

  const lengthPricing =
    definition.pricing.kind === "length"
      ? `Méteráras árazás (mező: ${definition.pricing.sourceFieldId}) — a variánsok ára 0 Ft.`
      : null;

  const editor = (
    <>
      <PageBlock
        column="main"
        blockId="product-definition-form"
        title="Termék"
        description="A mentés után a natív termékszerkezet a háttérben újragenerálódik. A mezők kiegészítő tulajdonságai (megjelenítési függőségek, tippek, minták) változatlanul megőrződnek."
      >
        <div className="flex flex-wrap items-center gap-3">
          {creatingNew && (
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                void save(false);
              }}
            >
              Létrehozás
            </Button>
          )}
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
                  Végleges: a natív termék slugja létrehozáskor ebből készül. Nem lehet "new".
                </span>
              </>
            ) : (
              <span className="font-mono text-xs">{definition.id}</span>
            )}
          </label>
          {creatingNew && (
            <label className="flex flex-col gap-1 text-sm">
              <span>Név</span>
              <Input
                className="w-80"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
              />
              <span className="text-muted-foreground text-xs">
                A natív termék neve; a mentés után a stock termékformában szerkeszthető.
              </span>
            </label>
          )}
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
            <Fragment key={row.key}>
              <FieldEditor
                row={row}
                index={index}
                count={rows.length}
                materialOptions={materialOptions}
                language={language}
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
              {kindSwitchKey?.key === row.key && (
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
                // The variant's SKU arrives as "code": a column literally
                // named "sku" collides with the product-detail page's shipped
                // table settings (the stock variants table hides it by
                // default) and would render hidden with an unfetched value.
                code: { header: "SKU", enableSorting: false },
                price: { header: "Ár (Ft)", enableSorting: false },
                facets: { header: "Facetek", enableSorting: false },
              }}
            />
          </div>
        </PageBlock>
      )}
    </>
  );

  if (mode === "create") {
    return <PageLayout>{editor}</PageLayout>;
  }

  // The embedded block sits in the stock page's full-width row; a nested
  // PageLayout would re-grid its cards into a 3/4-width main column.
  return <div className="space-y-4">{editor}</div>;
}
