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
 * registration, the create route and page, the page query extension that
 * carries the generated flag, and the stock blocks hidden on generated
 * products.
 *
 * Type-checked by src/dashboard/tsconfig.json (`check:dashboard`); at build
 * time the dashboard's vite pipeline bundles this file.
 */
import type { ReactElement } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Button,
  defineDashboardExtension,
  NEW_ENTITY_PATH,
  Page,
  PageTitle,
} from "@vendure/dashboard";
import type { PageContextValue } from "@vendure/dashboard";
import { z } from "zod";
import { ConfiguratorEditor } from "./product-definition-configurator";
import { ProductSaveActionBarItem } from "./product-save-action-bar-item";

import "../shared-markdown-editor/markdown-editor-extension";

// The editor re-validates the definition client-side with the canonical zod
// schema; its built-in messages are English, and the dashboard's UI language
// is Hungarian.
z.config(z.locales.hu());

// Extensions load for side effects only (the dashboard's virtual module
// dynamic-imports this file); the registration call must run on import.
defineDashboardExtension({
  routes: [
    {
      path: "/product-definitions/new",
      component: () => <NewProductDefinitionPage />,
    },
  ],
  detailForms: [
    {
      pageId: "product-detail",
      // The stock page's own query carries the generated flag, so the page
      // blocks' synchronous shouldRender can read it (the block API has no
      // async visibility hook).
      extendDetailDocument: `
        query ProductDefinitionByNativeProduct {
          product {
            productDefinition {
              productId
            }
          }
        }
      `,
    },
  ],
  pageBlocks: [
    {
      id: "product-definition-configurator",
      title: "Konfigurátor",
      description: "A strukturált termékmotor szerkesztője, a beépített termékoldalba ágyazva.",
      location: {
        pageId: "product-detail",
        column: "full",
        position: { blockId: "main-form", order: "after" },
      },
      component: ProductConfiguratorBlock,
      shouldRender: isGeneratedProduct,
    },
    // The native variant machinery is sync-owned: hand edits there are
    // overwritten (or read as drift), so the stock variants grid, the
    // generate-variants prompt and the option-group editor hide on generated
    // products via empty replacement blocks.
    {
      id: "hide-product-variants-table",
      location: {
        pageId: "product-detail",
        column: "full",
        position: { blockId: "product-variants-table", order: "replace" },
      },
      component: EmptyBlock,
      shouldRender: isGeneratedProduct,
    },
    {
      id: "hide-generate-variants",
      location: {
        pageId: "product-detail",
        column: "full",
        position: { blockId: "generate-variants", order: "replace" },
      },
      component: EmptyBlock,
      shouldRender: isGeneratedProduct,
    },
    {
      id: "hide-option-groups",
      location: {
        pageId: "product-detail",
        column: "full",
        position: { blockId: "option-groups", order: "replace" },
      },
      component: EmptyBlock,
      shouldRender: isGeneratedProduct,
    },
    {
      id: "variant-parent-product",
      title: "Termék",
      location: {
        pageId: "product-variant-detail",
        column: "side",
        position: { blockId: "options", order: "before" },
      },
      component: VariantParentProductBlock,
    },
  ],
  actionBarItems: [
    {
      pageId: "product-detail",
      id: "unified-product-save",
      position: { itemId: "save-button", order: "replace" },
      component: ({ context }) => (
        <ProductSaveActionBarItem context={context} definitionId={definitionIdOf(context)} />
      ),
      requiresPermission: ["UpdateProduct", "UpdateCatalog"],
    },
    {
      pageId: "product-list",
      component: NewProductDefinitionActionBarItem,
      requiresPermission: ["UpdateCatalog"],
    },
  ],
});

/** Suppresses the stock block it replaces; rendered inside FullWidthPageBlock,
 * an empty component leaves no visible trace. */
function EmptyBlock(): ReactElement {
  return <></>;
}

const VariantProductSchema = z.object({ product: z.object({ id: z.string(), name: z.string() }) });

/** Generated variant names list only field values, so the variant page names
 * the product they belong to. */
function VariantParentProductBlock({ context }: { context: PageContextValue }): ReactElement {
  const variant = VariantProductSchema.safeParse(context.entity);

  if (!variant.success) {
    return <></>;
  }

  return (
    <Link to="/products/$id" params={{ id: variant.data.product.id }} className="underline">
      {variant.data.product.name}
    </Link>
  );
}

function isGeneratedProduct(context: PageContextValue): boolean {
  return definitionIdOf(context) !== null;
}

function definitionIdOf(context: PageContextValue): string | null {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- PageContextValue.entity is typed `any` by the dashboard's own contract (page-provider.tsx); there is no typed alternative for extension blocks
  const productId: unknown = context.entity?.productDefinition?.productId;

  return typeof productId === "string" ? productId : null;
}

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
      Új konfigurátoros termék
    </Button>
  );
}

function NewProductDefinitionPage(): ReactElement {
  return (
    <Page pageId="product-definition-create">
      <PageTitle>Új konfigurátoros termék</PageTitle>
      <ConfiguratorEditor definitionId={NEW_ENTITY_PATH} mode="create" />
    </Page>
  );
}

/** The embedded block on the stock product-detail page: renders the
 * configurator editor for products generated from a ProductDefinition.
 * Definitions create their own native products — an existing product cannot
 * gain one retroactively. */
function ProductConfiguratorBlock({ context }: { context: PageContextValue }): ReactElement {
  const definitionId = definitionIdOf(context);

  if (definitionId === null) {
    return <></>;
  }

  return <ConfiguratorEditor key={definitionId} definitionId={definitionId} mode="embedded" />;
}
