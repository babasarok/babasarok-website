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
  ignoreFiles: ["**/dist/**"],
};

export default config;
