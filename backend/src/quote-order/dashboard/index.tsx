/**
 * Dashboard extension for the QuoteOrderPlugin, bundled into the Vendure
 * dashboard by the `dashboard` vite build. The order items table renders the
 * configText custom field — the product's selected options, one option per
 * line — as pre-formatted multi-line text instead of a single long line.
 */
import { defineDashboardExtension } from "@vendure/dashboard";

export default defineDashboardExtension({
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
      ],
    },
  ],
});
