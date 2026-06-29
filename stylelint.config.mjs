/**
 * @type {import('stylelint').Config}
 */
const config = {
  extends: [
    "stylelint-config-standard",
    "stylelint-config-tailwindcss",
    "stylelint-config-html/html",
    "stylelint-config-html/vue",
    "stylelint-config-html/svelte",
    "stylelint-config-html/astro",
  ],
  reportDescriptionlessDisables: true,
  reportInvalidScopeDisables: true,
  reportNeedlessDisables: true,
  ignoreFiles: ["**/dist/**", "public/admin/**", "node_modules/**", "tina/__generated__/**"],
  rules: {
    // Tailwind v4 `@utility` blocks legitimately interleave declarations with
    // nested `@media` at-rules, which this rule misreads as misplaced.
    "no-invalid-position-declaration": null,
    // `:global(...)` is valid in Astro/Svelte scoped <style> blocks.
    "selector-pseudo-class-no-unknown": [true, { ignorePseudoClasses: ["global"] }],
  },
  overrides: [
    {
      // Astro components inject dynamic styles via `<style set:html={...} />`,
      // which stylelint sees as an empty stylesheet.
      files: ["**/*.astro"],
      rules: { "no-empty-source": null },
    },
  ],
};

export default config;
