/**
 * Dashboard extension for the MaterialPlugin: a "Anyagok" section under the
 * catalog nav with a list and a detail/create page. Materials and their
 * colors are managed here (ADR 0009 — the catalog becomes Vendure-owned);
 * color images are picked from the dashboard's asset library.
 *
 * Type-checked by src/dashboard/tsconfig.json (`check:dashboard` runs it);
 * at build time the dashboard's vite pipeline bundles this file. The typed
 * graphql documents come from the backend's generated schema (src/gql).
 */
import { useEffect, useState, type ReactElement } from "react";
import type { AnyRoute } from "@tanstack/react-router";
import {
  ActionBarItem,
  Alert,
  AlertTitle,
  api,
  AssetPickerDialog,
  Button,
  defineDashboardExtension,
  DetailPageButton,
  Input,
  NEW_ENTITY_PATH,
  Page,
  PageActionBar,
  PageBlock,
  PageLayout,
  PageTitle,
} from "@vendure/dashboard";
import { graphql } from "@/gql";

const materialsQuery = graphql(`
  query Materials {
    materials {
      id
      label
      colors {
        id
        label
      }
    }
  }
`);

const materialQuery = graphql(`
  query Material($id: String!) {
    material(id: $id) {
      id
      label
      colors {
        id
        label
        hex
        asset {
          id
          name
          preview
        }
      }
    }
  }
`);

const createMaterialMutation = graphql(`
  mutation CreateMaterial($input: MaterialInput!) {
    createMaterial(input: $input) {
      id
    }
  }
`);

const updateMaterialMutation = graphql(`
  mutation UpdateMaterial($id: String!, $input: MaterialInput!) {
    updateMaterial(id: $id, input: $input) {
      id
    }
  }
`);

const deleteMaterialMutation = graphql(`
  mutation DeleteMaterial($id: String!) {
    deleteMaterial(id: $id)
  }
`);

interface MaterialListRow {
  id: string;
  label: string;
  colorCount: number;
}

interface AssetRef {
  id: string;
  name: string;
  preview: string;
}

interface ColorRow {
  /** React key, independent of the (editable) color id. */
  key: string;
  colorId: string;
  label: string;
  hex: string;
  asset: AssetRef | null;
}

function rowKey(): string {
  return crypto.randomUUID();
}

// Extensions load for side effects only (the dashboard's virtual module
// dynamic-imports this file); the registration call must run on import.
defineDashboardExtension({
  routes: [
    {
      path: "/materials",
      component: () => <MaterialsListPage />,
      navMenuItem: { sectionId: "catalog", title: "Anyagok" },
    },
    {
      path: "/materials/$id",
      component: (route) => <MaterialDetailPage route={route} />,
    },
  ],
});

function MaterialsListPage(): ReactElement {
  const [materials, setMaterials] = useState<MaterialListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .query(materialsQuery, {})
      .then((result) => {
        setMaterials(
          result.materials.map((material) => ({
            id: material.id,
            label: material.label,
            colorCount: material.colors.length,
          }))
        );
      })
      .catch((err: unknown) => {
        setError(String(err));
      });
  }, []);

  return (
    <Page pageId="material-list">
      <PageTitle>Anyagok</PageTitle>
      <PageActionBar>
        <ActionBarItem itemId="create-material">
          <DetailPageButton href="/materials/new" label="Új anyag" />
        </ActionBarItem>
      </PageActionBar>
      <PageLayout>
        <PageBlock column="main" blockId="material-list" title="Anyagok">
          {error !== null && <ErrorNotice message={error} />}
          {materials !== null && materials.length === 0 && <p>Még nincs egy anyag sem.</p>}
          {materials !== null && materials.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">Azonosító</th>
                  <th className="py-2 pr-4 font-medium">Név</th>
                  <th className="py-2 pr-4 font-medium">Színek</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((material) => (
                  <tr key={material.id} className="border-b">
                    <td className="py-2 pr-4 font-mono text-xs">{material.id}</td>
                    <td className="py-2 pr-4">
                      <DetailPageButton href={`/materials/${material.id}`} label={material.label} />
                    </td>
                    <td className="py-2 pr-4">{material.colorCount}</td>
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

function MaterialDetailPage({ route }: { route: AnyRoute }): ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- the dashboard's extension contract passes an AnyRoute whose useParams() is untyped any (vendure's own detail-page.tsx reads params the same way); there is no typed alternative
  const materialId: string = route.useParams().id ?? "";
  const navigate = route.useNavigate();
  const creatingNew = materialId === "" || materialId === NEW_ENTITY_PATH;

  const [label, setLabel] = useState("");
  const [newId, setNewId] = useState("");
  const [colors, setColors] = useState<ColorRow[]>([]);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [pickerRow, setPickerRow] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (creatingNew || loadedId === materialId) {
      return;
    }

    setLoadedId(materialId);
    api
      .query(materialQuery, { id: materialId })
      .then((result) => {
        if (result.material === null) {
          setErrors([`Nincs anyag ezzel az azonosítóval: ${materialId}`]);
          return;
        }

        setLabel(result.material.label);
        setColors(
          result.material.colors.map((color) => ({
            key: rowKey(),
            colorId: color.id,
            label: color.label,
            hex: color.hex ?? "",
            asset: color.asset,
          }))
        );
      })
      .catch((err: unknown) => {
        setErrors([String(err)]);
      });
  }, [creatingNew, loadedId, materialId]);

  function addColor(): void {
    setColors((rows) => [...rows, { key: rowKey(), colorId: "", label: "", hex: "", asset: null }]);
  }

  function updateColor(key: string, patch: Partial<ColorRow>): void {
    setColors((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function removeColor(key: string): void {
    setColors((rows) => rows.filter((row) => row.key !== key));
  }

  async function save(): Promise<void> {
    setErrors(null);
    setSaved(false);
    setPending(true);
    const input = {
      id: (creatingNew ? newId : materialId).trim(),
      label: label.trim(),
      colors: colors.map((row) => ({
        id: row.colorId.trim(),
        label: row.label.trim(),
        hex: row.asset === null ? row.hex.trim() || null : null,
        assetId: row.asset?.id ?? null,
      })),
    };

    try {
      if (creatingNew) {
        const result = await api.query(createMaterialMutation, { input });
        await navigate({ to: "/materials/$id", params: { id: result.createMaterial.id } });
      } else {
        await api.query(updateMaterialMutation, { id: materialId, input });
        setSaved(true);
      }
    } catch (err: unknown) {
      setErrors(err instanceof Error ? err.message.split("\n") : [String(err)]);
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
      await api.query(deleteMaterialMutation, { id: materialId });
      await navigate({ to: "/materials" });
    } catch (err: unknown) {
      setErrors(err instanceof Error ? err.message.split("\n") : [String(err)]);
      setPending(false);
    }
  }

  const pickerRowData = colors.find((row) => row.key === pickerRow) ?? null;

  return (
    <Page pageId="material-detail">
      <PageTitle>{creatingNew ? "Új anyag" : label}</PageTitle>
      <PageActionBar>
        <ActionBarItem itemId="save-material">
          <Button
            type="button"
            onClick={() => {
              void save();
            }}
            disabled={pending}
          >
            {creatingNew ? "Létrehozás" : "Mentés"}
          </Button>
        </ActionBarItem>
        {!creatingNew && (
          <ActionBarItem itemId="delete-material">
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                void remove();
              }}
              disabled={pending}
            >
              {confirmDelete ? "Biztos? Kattints újra" : "Törlés"}
            </Button>
          </ActionBarItem>
        )}
      </PageActionBar>
      <PageLayout>
        <PageBlock column="main" blockId="material-form" title="Anyag">
          {errors !== null && <ErrorNotice message={errors.join("\n")} />}
          {saved && (
            <Alert>
              <AlertTitle>Mentés sikeres.</AlertTitle>
            </Alert>
          )}

          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-sm">
              <span>Azonosító</span>
              {creatingNew ? (
                <Input
                  value={newId}
                  onChange={(e) => {
                    setNewId(e.target.value);
                  }}
                />
              ) : (
                <span className="font-mono text-xs">{materialId}</span>
              )}
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>Név</span>
              <Input
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value);
                }}
              />
            </label>
          </div>
        </PageBlock>
        <PageBlock
          column="main"
          blockId="material-colors"
          title="Színek/minták"
          description="Minden színhez adj meg hex kódot VAGY képet."
        >
          <div className="flex flex-col gap-4">
            {colors.map((row) => (
              <div key={row.key} className="flex items-end gap-2 rounded border p-3">
                <label className="flex flex-col gap-1 text-sm">
                  <span>Kód</span>
                  <Input
                    className="w-32"
                    value={row.colorId}
                    onChange={(e) => {
                      updateColor(row.key, { colorId: e.target.value });
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Név</span>
                  <Input
                    className="w-40"
                    value={row.label}
                    onChange={(e) => {
                      updateColor(row.key, { label: e.target.value });
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span>Színkód</span>
                  <input
                    type="color"
                    className="h-9 w-14 cursor-pointer rounded border"
                    value={
                      row.asset === null && /^#[0-9a-fA-F]{6}$/.test(row.hex) ? row.hex : "#ffffff"
                    }
                    onChange={(e) => {
                      updateColor(row.key, { hex: e.target.value, asset: null });
                    }}
                    disabled={row.asset !== null}
                  />
                </label>
                <div className="flex items-center gap-2">
                  {row.asset !== null && (
                    <img
                      src={row.asset.preview}
                      alt={row.asset.name}
                      className="h-9 w-9 rounded border object-cover"
                    />
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPickerRow(row.key);
                    }}
                  >
                    {row.asset === null ? "Kép választása" : "Kép cseréje"}
                  </Button>
                  {row.asset !== null && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        updateColor(row.key, { asset: null });
                      }}
                    >
                      Kép törlése
                    </Button>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    removeColor(row.key);
                  }}
                >
                  Sor törlése
                </Button>
              </div>
            ))}
            <div>
              <Button type="button" variant="outline" onClick={addColor}>
                + Szín hozzáadása
              </Button>
            </div>
          </div>
        </PageBlock>
      </PageLayout>

      {pickerRowData !== null && (
        <AssetPickerDialog
          open
          onClose={() => {
            setPickerRow(null);
          }}
          onSelect={(assets) => {
            const asset = assets[0];

            if (pickerRow !== null) {
              updateColor(pickerRow, {
                asset: { id: asset.id, name: asset.name, preview: asset.preview },
                hex: "",
              });
            }

            setPickerRow(null);
          }}
          multiSelect={false}
          title="Kép választása"
        />
      )}
    </Page>
  );
}

function ErrorNotice({ message }: { message: string }): ReactElement {
  return (
    <Alert variant="destructive">
      <AlertTitle className="whitespace-pre-wrap">{message}</AlertTitle>
    </Alert>
  );
}
