/**
 * Dashboard extension for the ProductPlugin: creation of configurator products
 * via the `/product-definitions/new` route (opened from the stock products
 * list's action bar) and a configurator block embedded on the stock
 * product-detail page for products generated from a definition (ADR 0010
 * decision 3) — that block is the editor home and hosts delete.
 *
 * The editor itself lives in product-definition-configurator.tsx (with its
 * per-field editors in product-definition-fields.tsx and the pure editor
 * logic in product-definition-editor.ts). This entry file keeps only the
 * registration, the create route and page, and the embedded block's lookup.
 *
 * Type-checked by src/dashboard/tsconfig.json (`check:dashboard`); at build
 * time the dashboard's vite pipeline bundles this file. The typed graphql
 * documents come from the backend's generated schema (src/gql).
 */
import { useEffect, useState, type ReactElement } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  api,
  Button,
  defineDashboardExtension,
  NEW_ENTITY_PATH,
  Page,
  PageTitle,
} from "@vendure/dashboard";
import type { PageContextValue } from "@vendure/dashboard";
import { graphql } from "@/gql";
import { ConfiguratorEditor } from "./product-definition-configurator";
import { ErrorNotice } from "./shared";

const productDefinitionByNativeProductQuery = graphql(`
  query ProductDefinitionByNativeProduct($nativeProductId: Int!) {
    productDefinitionByNativeProduct(nativeProductId: $nativeProductId) {
      productId
    }
  }
`);

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
