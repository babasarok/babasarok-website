import { LanguageCode } from "@vendure/common/lib/generated-types";
import { vendureDashboardPlugin } from "@vendure/dashboard/vite";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig } from "vite";

// Builds the Vendure Dashboard served by DashboardPlugin at /dashboard.
// The vendureDashboardPlugin compiles and imports vendure-config.ts to
// introspect the Admin API schema, so the build needs the env vars
// vendure-config requires (the Dockerfile provides placeholders).
export default defineConfig({
  base: "/dashboard/",
  build: {
    outDir: "dist/dashboard",
  },
  plugins: [
    vendureDashboardPlugin({
      vendureConfigPath: pathToFileURL("./src/vendure-config.ts"),
      api: { host: "auto", port: "auto" },
      i18n: {
        defaultLanguage: LanguageCode.hu,
        availableLanguages: [LanguageCode.hu, LanguageCode.en],
      },
      gqlOutputPath: "./src/gql",
    }),
  ],
  resolve: {
    alias: {
      // Lets plugin dashboard extensions reference the shared generated types.
      "@/gql": resolve(__dirname, "./src/gql/graphql.ts"),
    },
  },
});
