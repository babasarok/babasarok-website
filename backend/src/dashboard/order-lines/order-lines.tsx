/**
 * Dashboard extension bundled into the Vendure dashboard by the `dashboard`
 * vite build (wired via the checkout plugin). It customizes the built-in
 * order-detail page for every order — legacy quote orders and native checkout
 * orders alike render from their stored line snapshots:
 *
 * - the order items table renders the configText custom field — the product's
 *   selected options, one option per line — as pre-formatted multi-line text
 *   instead of a single long line;
 * - the product-variant column shows the product's name linked to the product
 *   (a configurable product has one variant; its choices are the configText,
 *   ADR 0016) — the built-in table selects the variant only, so the product
 *   comes through the detail-document extension below. A line of an order
 *   placed before ADR 0016 also names its historical variant.
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
            id
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
                {/* The button molecule is whitespace-nowrap; a long name would
                    force the cell to one line and squeeze configText into
                    wrapping its every line — re-allow wrapping on the label. */}
                <DetailPageButton
                  id={value.product.id}
                  label={
                    <span className="break-words whitespace-pre-wrap">{value.product.name}</span>
                  }
                  href={`/products/${value.product.id}`}
                />
                {value.name !== value.product.name && (
                  <span className="text-muted-foreground text-xs">{value.name}</span>
                )}
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
