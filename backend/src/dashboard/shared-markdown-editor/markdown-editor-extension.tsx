import { defineDashboardExtension } from "@vendure/dashboard";
import { MarkdownEditor } from "./markdown-editor";

// Extensions load for side effects only; any dashboard module that wants the
// editor imports this file.
defineDashboardExtension({
  detailForms: [
    {
      pageId: "product-detail",
      inputs: [{ blockId: "main-form", field: "description", component: MarkdownEditor }],
    },
  ],
  customFormComponents: {
    customFields: [{ id: "markdown-editor", component: MarkdownEditor }],
  },
});
