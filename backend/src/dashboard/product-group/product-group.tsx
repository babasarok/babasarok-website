/**
 * Dashboard extension for the ProductGroupPlugin: a "Termékcsoportok" section
 * under the catalog nav with a list and a detail/create page. Discounted sets
 * (szett) and related-items groups are managed here, with members picked from
 * the existing product definitions (ADR 0010 decision 6).
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
import { errorCodeOf, ErrorNotice } from "../shared";

const productGroupsQuery = graphql(`
  query ProductGroups {
    productGroups {
      id
      groupId
      label
      kind
      discount
      productIds
    }
  }
`);

const productGroupQuery = graphql(`
  query ProductGroup($groupId: String!) {
    productGroup(groupId: $groupId) {
      id
      groupId
      label
      kind
      discount
      productIds
    }
  }
`);

const productDefinitionsQuery = graphql(`
  query ProductGroupMembers {
    productDefinitions(options: { skip: 0, take: 500 }) {
      totalItems
      items {
        productId
        label
      }
    }
  }
`);

const createProductGroupMutation = graphql(`
  mutation CreateProductGroup($groupId: String!, $input: ProductGroupInput!) {
    createProductGroup(groupId: $groupId, input: $input) {
      groupId
    }
  }
`);

const updateProductGroupMutation = graphql(`
  mutation UpdateProductGroup($groupId: String!, $input: ProductGroupInput!) {
    updateProductGroup(groupId: $groupId, input: $input) {
      groupId
    }
  }
`);

const deleteProductGroupMutation = graphql(`
  mutation DeleteProductGroup($groupId: String!) {
    deleteProductGroup(groupId: $groupId)
  }
`);

interface ProductGroupListRow {
  id: string;
  groupId: string;
  label: string;
  kind: string;
  discount: number | null;
  memberCount: number;
}

function kindLabel(kind: string): string {
  return kind === "discounted-set" ? "Szett" : "Kapcsolódó termékek";
}

// Extensions load for side effects only (the dashboard's virtual module
// dynamic-imports this file); the registration call must run on import.
defineDashboardExtension({
  routes: [
    {
      path: "/product-groups",
      component: () => <ProductGroupsListPage />,
      navMenuItem: { sectionId: "catalog", title: "Termékcsoportok" },
    },
    {
      path: "/product-groups/$id",
      component: (route) => <ProductGroupDetailPage route={route} />,
    },
  ],
});

function ProductGroupsListPage(): ReactElement {
  const [groups, setGroups] = useState<ProductGroupListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .query(productGroupsQuery, {})
      .then((result) => {
        setGroups(
          result.productGroups.map((group) => ({
            id: group.id,
            groupId: group.groupId,
            label: group.label,
            kind: group.kind,
            discount: group.discount,
            memberCount: group.productIds.length,
          }))
        );
      })
      .catch((err: unknown) => {
        setError(String(err));
      });
  }, []);

  return (
    <Page pageId="product-group-list">
      <PageTitle>Termékcsoportok</PageTitle>
      <PageActionBar>
        <ActionBarItem itemId="create-product-group">
          <DetailPageButton href="/product-groups/new" label="Új termékcsoport" />
        </ActionBarItem>
      </PageActionBar>
      <PageLayout>
        <PageBlock column="main" blockId="product-group-list" title="Termékcsoportok">
          {error !== null && <ErrorNotice message={error} />}
          {groups !== null && groups.length === 0 && <p>Még nincs egy termékcsoport sem.</p>}
          {groups !== null && groups.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left">
                  <th className="py-2 pr-4 font-medium">Azonosító</th>
                  <th className="py-2 pr-4 font-medium">Név</th>
                  <th className="py-2 pr-4 font-medium">Típus</th>
                  <th className="py-2 pr-4 font-medium">Kedvezmény</th>
                  <th className="py-2 pr-4 font-medium">Tagok</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id} className="border-b">
                    <td className="py-2 pr-4 font-mono text-xs">{group.groupId}</td>
                    <td className="py-2 pr-4">
                      <DetailPageButton
                        href={`/product-groups/${group.groupId}`}
                        label={group.label}
                      />
                    </td>
                    <td className="py-2 pr-4">{kindLabel(group.kind)}</td>
                    <td className="py-2 pr-4">
                      {group.discount === null ? "—" : `${group.discount} Ft`}
                    </td>
                    <td className="py-2 pr-4">{group.memberCount}</td>
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

interface MemberRow {
  productId: string;
  label: string;
  selected: boolean;
}

function ProductGroupDetailPage({ route }: { route: AnyRoute }): ReactElement {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- the dashboard's extension contract passes an AnyRoute whose useParams() is untyped any (vendure's own detail-page.tsx reads params the same way); there is no typed alternative
  const groupId: string = route.useParams().id ?? "";
  const navigate = route.useNavigate();
  const creatingNew = groupId === "" || groupId === NEW_ENTITY_PATH;

  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<"discounted-set" | "related-items">("discounted-set");
  const [discount, setDiscount] = useState("");
  const [newId, setNewId] = useState("");
  const [storedGroupId, setStoredGroupId] = useState("");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (loadedId !== null) {
      return;
    }

    setLoadedId(groupId);

    api
      .query(productDefinitionsQuery, {})
      .then((result) => {
        setMembers(
          result.productDefinitions.items.map((product) => ({
            productId: product.productId,
            label: product.label,
            selected: false,
          }))
        );
      })
      .catch((err: unknown) => {
        setErrors([String(err)]);
      });

    if (creatingNew) {
      return;
    }

    api
      .query(productGroupQuery, { groupId })
      .then((result) => {
        const group = result.productGroup;

        if (group === null) {
          setErrors([`Nincs termékcsoport ezzel az azonosítóval: ${groupId}`]);
          return;
        }

        setLabel(group.label);
        if (group.kind === "related-items") {
          setKind("related-items");
        }
        setDiscount(group.discount === null ? "" : String(group.discount));
        setStoredGroupId(group.groupId);
        setMembers((rows) =>
          rows.map((row) => ({
            ...row,
            selected: group.productIds.includes(row.productId),
          }))
        );
      })
      .catch((err: unknown) => {
        setErrors([String(err)]);
      });
  }, [creatingNew, groupId, loadedId]);

  function toggleMember(productId: string): void {
    setMembers((rows) =>
      rows.map((row) => (row.productId === productId ? { ...row, selected: !row.selected } : row))
    );
  }

  async function save(): Promise<void> {
    setErrors(null);
    setSaved(false);

    const selected = members.filter((row) => row.selected);
    const localErrors: string[] = [];

    if (creatingNew && newId.trim() === "") {
      localErrors.push("Az azonosító megadása kötelező.");
    }

    if (label.trim() === "") {
      localErrors.push("A név megadása kötelező.");
    }

    if (selected.length < 2) {
      localErrors.push("Legalább két tagot válassz ki.");
    }

    const discountValue = kind === "discounted-set" ? Math.round(Number(discount)) : null;

    if (kind === "discounted-set" && (discountValue === null || discountValue <= 0)) {
      localErrors.push("A szett kedvezmény pozitív egész szám (Ft) legyen.");
    }

    if (localErrors.length > 0) {
      setErrors(localErrors);
      return;
    }

    setPending(true);
    const input = {
      label: label.trim(),
      kind,
      discount: discountValue,
      productIds: selected.map((row) => row.productId),
    };

    try {
      if (creatingNew) {
        await api.query(createProductGroupMutation, { groupId: newId.trim(), input });
        await navigate({ to: "/product-groups/$id", params: { id: newId.trim() } });
      } else {
        await api.query(updateProductGroupMutation, { groupId: storedGroupId, input });
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
      await api.query(deleteProductGroupMutation, { groupId: storedGroupId });
      await navigate({ to: "/product-groups" });
    } catch (err: unknown) {
      setErrors(err instanceof Error ? err.message.split("\n") : [String(err)]);

      // A refused delete (a promotion references the group) must not leave
      // the confirmation armed for a blind second attempt.
      if (errorCodeOf(err) === "PRODUCT_GROUP_IN_PROMOTION") {
        setConfirmDelete(false);
      }

      setPending(false);
    }
  }

  return (
    <Page pageId="product-group-detail">
      <PageTitle>{creatingNew ? "Új termékcsoport" : label}</PageTitle>
      <PageActionBar>
        <ActionBarItem itemId="save-product-group">
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
          <ActionBarItem itemId="delete-product-group">
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
        <PageBlock column="main" blockId="product-group-form" title="Termékcsoport">
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
                <span className="font-mono text-xs">{storedGroupId}</span>
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
            <label className="flex flex-col gap-1 text-sm">
              <span>Típus</span>
              <select
                className="rounded-md border bg-transparent px-3 py-2 text-sm"
                value={kind}
                onChange={(e) => {
                  const value = e.target.value;

                  if (value === "discounted-set" || value === "related-items") {
                    setKind(value);
                  }
                }}
              >
                <option value="discounted-set">Szett (kedvezménnyel)</option>
                <option value="related-items">Kapcsolódó termékek</option>
              </select>
            </label>
            {kind === "discounted-set" && (
              <label className="flex flex-col gap-1 text-sm">
                <span>Szett kedvezmény (Ft)</span>
                <Input
                  type="number"
                  value={discount}
                  onChange={(e) => {
                    setDiscount(e.target.value);
                  }}
                />
              </label>
            )}
          </div>
        </PageBlock>
        <PageBlock
          column="main"
          blockId="product-group-members"
          title="Tagok"
          description="Legalább két termék. Szett esetén a kedvezmény akkor érvényesül, ha kompatibilis tagok kerülnek a kosárba."
        >
          <div className="flex flex-col gap-1">
            {members.map((row) => (
              <label key={row.productId} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={row.selected}
                  onChange={() => {
                    toggleMember(row.productId);
                  }}
                />
                <span>{row.label}</span>
                <span className="text-muted-foreground font-mono text-xs">{row.productId}</span>
              </label>
            ))}
            {members.length === 0 && <p>Nincs importált termék.</p>}
          </div>
        </PageBlock>
      </PageLayout>
    </Page>
  );
}
