import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";
import unicorn from "eslint-plugin-unicorn";
import svelte from "eslint-plugin-svelte";
import svelteConfig from "./svelte.config.ts";

import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores([
    "node_modules/",
    "dist/",
    ".astro/",
    ".pnpm-store",
    "public/admin/",
    "tina/__generated__",
    "scripts",
    "old",
  ]),
  {
    plugins: { js, astro, unicorn },
    extends: ["js/recommended"],
    linterOptions: {
      reportUnusedDisableDirectives: "error",
      reportUnusedInlineConfigs: "error",
    },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  tseslint.configs.strictTypeChecked,
  unicorn.configs.unopinionated,
  svelte.configs.recommended,
  astro.configs.recommended,
  astro.configs["jsx-a11y-strict"],
  {
    languageOptions: {
      parserOptions: {
        parser: "@typescript-eslint/parser",
        project: "./tsconfig.json",
        extraFileExtensions: [".astro", ".svelte"],
      },
    },
    settings: {
      react: {
        // TODO: Track https://github.com/jsx-eslint/eslint-plugin-react/issues/3977 and revert back to detect when fixed
        version: "18",
      },
    },
    rules: {
      "astro/no-conflict-set-directives": "error",
      // Too many false positives, so sad
      "astro/no-unused-css-selector": "off",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-import-type-side-effects": "error",
      // unused vars are not the end of the world, they are useful during development
      // and can be stripped during build anyway.
      // Ignore `_`-prefixed identifiers (intentional unused convention) and `Props`
      // (Astro convention: declared for caller type-checking even when not destructured).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_|^Props$",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      // We know full well which functions need to be async
      // and which ones don't
      "@typescript-eslint/require-await": "off",
      // Always explicitly define function return types with some caveats
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowConciseArrowFunctionExpressionsStartingWithVoid: false,
          allowDirectConstAssertionInArrowFunctions: true,
          allowExpressions: true,
          allowFunctionsWithoutTypeParameters: false,
          allowHigherOrderFunctions: true,
          allowIIFEs: false,
          allowTypedFunctionExpressions: true,
        },
      ],
      "unicorn/no-empty-file": "error",
      curly: "error",
      "@typescript-eslint/no-empty-object-type": [
        "error",
        {
          allowInterfaces: "with-single-extends",
        },
      ],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowNumber: true,
          allowBoolean: true,
          allowNullish: true,
          allowAny: false,
          allowRegExp: false,
        },
      ],
    },
  },
  // Astro-specific warnings and recommendations for .astro files
  {
    files: ["**/*.astro"],
    rules: {
      // The `astro:*` virtual modules (e.g. `astro:components`) are typed as
      // `any` in the typed-lint pass because their generated types aren't part
      // of the ESLint TS project, so the `no-unsafe-*` family produces false
      // positives. TypeScript itself infers these correctly via `astro check`.
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
    },
  },
  {
    files: ["**/*.svelte", "**/*.svelte.ts", "**/*.svelte.js"],
    // See more details at: https://typescript-eslint.io/packages/parser/
    languageOptions: {
      parserOptions: {
        extraFileExtensions: [".svelte"],
        parser: tseslint.parser,
        svelteConfig,
      },
    },
    rules: {
      "unicorn/prefer-top-level-await": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-useless-default-assignment": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },
]);
