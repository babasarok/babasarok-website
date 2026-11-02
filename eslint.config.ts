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
    // Has its own toolchain (Vendure/NestJS decorators) and tsconfigs; linted
    // by the backend-scoped block below against those tsconfigs.
    "backend/dist",
    "backend/node_modules",
    "backend/src/gql",
    "packages/product-definition/dist",
    "packages/pricing/dist",
  ]),
  {
    plugins: { js, astro, unicorn },
    extends: ["js/recommended"],
    linterOptions: {
      reportUnusedDisableDirectives: "error",
      reportUnusedInlineConfigs: "error",
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        // Defined by the gtag shim in Base.astro; typed via @types/gtag.js.
        gtag: "readonly",
      },
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
      // We prefer if/else over ternaries
      "unicorn/prefer-ternary": "off",
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
  {
    files: ["backend/**/*.ts", "backend/**/*.tsx", "backend/**/*.mts"],
    languageOptions: {
      parserOptions: {
        parser: "@typescript-eslint/parser",
        project: [
          "./tsconfig.json",
          "./backend/tsconfig.json",
          "./backend/tsconfig.dashboard.json",
          "./backend/src/dashboard/tsconfig.json",
          "./backend/tsconfig.scripts.json",
        ],
        extraFileExtensions: [],
      },
    },
    rules: {
      // Vendure plugin definitions are empty decorated classes.
      "@typescript-eslint/no-extraneous-class": ["error", { allowEmpty: true }],
    },
  },
  {
    files: ["backend/src/migrations/**/*.ts"],
    rules: {
      // TypeORM's migration generator emits `Promise<any>` signatures and
      // its own idioms; historical migrations are generator output, not
      // hand-written code.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/consistent-type-imports": "off",
      "unicorn/no-useless-undefined": "off",
    },
  },
  {
    files: [
      "backend/src/index.ts",
      "backend/src/index-worker.ts",
      "backend/src/migrate.ts",
      "backend/src/generate-migration.ts",
      "backend/src/env.ts",
      // Compiled to CommonJS, where __dirname is the idiomatic path source.
      "backend/src/vendure-config.ts",
    ],
    rules: {
      // Process entry points: exiting with a status code is the contract, and
      // the compiled output is CommonJS, where top-level await is illegal.
      "unicorn/no-process-exit": "off",
      "unicorn/prefer-top-level-await": "off",
      // generate-migration.ts resolves paths relative to its compiled location.
      "unicorn/prefer-module": "off",
    },
  },
  {
    files: ["src/pages/**/*.astro"],
    rules: {
      // Astro frontmatter is a function body: `return` is how a page hands
      // back a Response (404, redirect).
      "unicorn/prefer-module": "off",
    },
  },
  {
    files: ["backend/scripts/**/*.ts"],
    rules: {
      // Process entry points: exiting with a status code is the contract.
      "unicorn/no-process-exit": "off",
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
