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
import { type ResultOf, graphql } from "@/gql";
import { DetailPageButton } from "@/vdb/components/shared/detail-page-button.js";

const orderDetailExtension = graphql(`
  query GetOrderExtension($id: ID!) {
    order(id: $id) {
      id
      lines {
        productVariant {
          id
          name
          product {
            name
          }
        }
      }
    }
  }
`);

/**
 * The order line's variant as the order-detail cell sees it: `id` and `name`
 * come from the dashboard's own line fragment, `product` from the extension.
 */
type ProductVariantValue = NonNullable<
  ResultOf<typeof orderDetailExtension>["order"]
>["lines"][number]["productVariant"];

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
          component: ({ value }: { value?: ProductVariantValue }) => {
            if (!value) {
              return null;
            }

            return (
              <div className="flex flex-col items-start gap-0.5 py-1">
                <span className="text-muted-foreground text-xs">{value.product.name}</span>
                <DetailPageButton
                  id={value.id}
                  label={value.name}
                  href={`/product-variants/${value.id}`}
                />
              </div>
            );
          },
        },
      ],
      viewOptionDefaults: {
        columnVisibility: { configText: true },
      },
    },
  ],
  detailForms: [
    {
      pageId: "order-detail",
      extendDetailDocument: orderDetailExtension,
    },
  ],
});
