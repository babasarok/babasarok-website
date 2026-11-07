/**
 * Dashboard extension for the ProductPlugin: creation of configurator products
 * on the stock `/products/new` page (a Konfigurátor toggle in the unified save
 * action-bar item reveals the configurator blocks; the unified Létrehozás
 * button drives the create), and a configurator block embedded on the stock
 * product-detail page for products generated from a definition (ADR 0010
 * decision 3) — that block is the editor home and hosts delete.
 *
 * The editor itself lives in product-definition-configurator.tsx (with its
 * per-field editors in product-definition-fields.tsx and the pure editor
 * logic in product-definition-editor.ts). This entry file keeps only the
 * registration, the create-page block, the page query extension that
 * carries the generated flag, and the stock blocks hidden on generated
 * products.
 *
 * Type-checked by src/dashboard/tsconfig.json (`check:dashboard`); at build
 * time the dashboard's vite pipeline bundles this file.
 */
import type { ReactElement } from "react";
import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { defineDashboardExtension, NEW_ENTITY_PATH } from "@vendure/dashboard";
import type { PageContextValue } from "@vendure/dashboard";
import { Switch } from "@/vdb/components/ui/switch.js";
import { z } from "zod";
import { ConfiguratorEditor } from "./product-definition-configurator";
import { ProductSaveActionBarItem } from "./product-save-action-bar-item";
import {
  resetConfiguratorCreate,
  setConfiguratorCreate,
  useConfiguratorCreate,
} from "./product-definition-create-store";

import "../shared-markdown-editor/markdown-editor-extension";

// The editor re-validates the definition client-side with the canonical zod
// schema; its built-in messages are English, and the dashboard's UI language
// is Hungarian.
z.config(z.locales.hu());

// Extensions load for side effects only (the dashboard's virtual module
// dynamic-imports this file); the registration call must run on import.
defineDashboardExtension({
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
    // The configurator sits at the bottom of the main column on both the
    // new-product page and the product page: the layout engine renders
    // full-width blocks first, so bottom placement rules out column "full".
    // The edit page anchors after whichever of the two mutually exclusive
    // stock variant blocks the product has.
    {
      id: "product-definition-create",
      title: "Konfigurátor",
      location: {
        pageId: "product-detail",
        column: "main",
        position: { blockId: "custom-fields", order: "after" },
      },
      component: ProductDefinitionCreateBlock,
      shouldRender: isCreatingEntity,
    },
    {
      id: "product-definition-configurator-with-variants",
      title: "Konfigurátor",
      location: {
        pageId: "product-detail",
        column: "main",
        position: { blockId: "product-variants-table", order: "after" },
      },
      component: ProductConfiguratorBlock,
      shouldRender: isGeneratedProduct,
    },
    {
      id: "product-definition-configurator-without-variants",
      title: "Konfigurátor",
      location: {
        pageId: "product-detail",
        column: "main",
        position: { blockId: "generate-variants", order: "after" },
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

function isCreatingEntity(context: PageContextValue): boolean {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- PageContextValue.entity is typed `any` by the dashboard's own contract (page-provider.tsx); there is no typed alternative for extension blocks
  const entityId: unknown = context.entity?.id;

  return typeof entityId !== "string";
}

function definitionIdOf(context: PageContextValue): string | null {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- PageContextValue.entity is typed `any` by the dashboard's own contract (page-provider.tsx); there is no typed alternative for extension blocks
  const productId: unknown = context.entity?.productDefinition?.productId;

  return typeof productId === "string" ? productId : null;
}

/** The configurator card on the stock new-product page: the Konfigurátor
 * switch lives here (an action-bar switch cannot make page blocks appear or
 * disappear reactively), and the editor mounts below it when the toggle is
 * on. The switch is a bare module store, so this block subscribes to it
 * directly. */
function ProductDefinitionCreateBlock({ context }: { context: PageContextValue }): ReactElement {
  const createMode = useConfiguratorCreate();

  useEffect(() => {
    return () => {
      resetConfiguratorCreate();
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex items-center gap-2"
        title="Bekapcsolva a termék strukturált konfigurátorból jön létre (mezők, anyagok, árazás)"
        data-testid="product-definition-create-toggle"
      >
        <label htmlFor="product-definition-create-toggle-input" className="text-sm font-medium">
          Konfigurátoros termék
        </label>
        <Switch
          id="product-definition-create-toggle-input"
          checked={createMode}
          onCheckedChange={setConfiguratorCreate}
        />
      </div>
      {createMode && (
        <ConfiguratorEditor
          key="create"
          definitionId={NEW_ENTITY_PATH}
          mode="create"
          pageForm={context.form}
        />
      )}
    </div>
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
