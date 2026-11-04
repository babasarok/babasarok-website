/**
 * Dashboard extension for the QuoteOrderPlugin, bundled into the Vendure
 * dashboard by the `dashboard` vite build. It customizes the built-in
 * order-detail page:
 *
 * - the order items table renders the configText custom field — the product's
 *   selected options, one option per line — as pre-formatted multi-line text
 *   instead of a single long line;
 * - the product-variant column also shows the product's name (the built-in
 *   table selects the variant name only), fetched through the detail-document
 *   extension below.
 */
import { defineDashboardExtension } from "@vendure/dashboard";
import { graphql } from "@/gql";
import { DetailPageButton } from "@/vdb/components/shared/detail-page-button.js";

// Extensions load for side effects only.
defineDashboardExtension({
  dataTables: [
    {
      pageId: "order-detail",
      blockId: "order-table",
      displayComponents: [
        {
          column: "configText",
          component: ({ value }) => (
            <span className="break-words whitespace-pre-wrap">
              {typeof value === "string" ? value : ""}
            </span>
          ),
        },
        {
          column: "productVariant",
          component: ({ row }) => {
            const variant = row.original.productVariant;

            return (
              <div className="flex flex-col items-start gap-0.5 py-1">
                <span className="text-muted-foreground text-xs">{variant?.product?.name}</span>
                <DetailPageButton
                  id={variant.id}
                  label={variant.name}
                  href={`/product-variants/${variant.id}`}
                />
              </div>
            );
          },
        },
      ],
    },
  ],
  detailForms: [
    {
      pageId: "order-detail",
      extendDetailDocument: graphql(`
        query GetOrderExtension($id: ID!) {
          order(id: $id) {
            id
            lines {
              productVariant {
                product {
                  name
                }
              }
            }
          }
        }
      `),
    },
  ],
});
