import { Linter } from "eslint";
import astro from "eslint-plugin-astro";
import svelte from "eslint-plugin-svelte";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import { siteLanguagePlugin } from "./site-language";

type Parser = NonNullable<Linter.LanguageOptions["parser"]>;

function isParser(value: unknown): value is Parser {
  return (
    typeof value === "object" && value !== null && ("parse" in value || "parseForESLint" in value)
  );
}

/** The markup parsers come with the plugins the site config already uses. */
function pluginParser(configs: readonly Linter.Config[], name: string): Parser {
  for (const config of configs) {
    const parser: unknown = config.languageOptions?.parser;

    if (isParser(parser) && parser.meta?.name === name) {
      return parser;
    }
  }

  throw new Error(`No ${name} in the plugin's recommended config.`);
}

const astroParser = pluginParser(astro.configs.recommended, "astro-eslint-parser");
const svelteParser = pluginParser(svelte.configs.recommended, "svelte-eslint-parser");

function messages(code: string, rule: string, filename: string, parser: Parser): string[] {
  const linter = new Linter({ configType: "flat" });

  return linter
    .verify(
      code,
      {
        files: ["**/*.ts", "**/*.svelte", "**/*.astro"],
        languageOptions: { parser, parserOptions: { parser: tseslint.parser } },
        plugins: { "site-language": siteLanguagePlugin },
        rules: { [`site-language/${rule}`]: "error" },
      },
      filename
    )
    .map((message) => message.message);
}

function inTs(code: string, rule: string): string[] {
  return messages(code, rule, "guarded.ts", tseslint.parser);
}

function inSvelte(code: string, rule: string): string[] {
  return messages(code, rule, "Guarded.svelte", svelteParser);
}

function inAstro(code: string, rule: string): string[] {
  return messages(code, rule, "Guarded.astro", astroParser);
}

describe("localized-paths", () => {
  const rule = "localized-paths";

  it.each([
    'const href = "/checkout";',
    "const href = `/${target}`;",
    "const href = `/product/${slug}/`;",
    'location.href = "/product/";',
  ])("flags an internal path built outside localizedPath: %s", (code) => {
    expect(inTs(code, rule)).toHaveLength(1);
  });

  it.each([
    'localizedPath("/checkout", locale);',
    "localizedPath(`/product/${slug}/`, locale);",
    'localizedPath(target ? `/${target}` : "/contact", locale);',
    'localizedPath(item.url ?? "/", locale);',
    'const isHome = pathname === "/";',
    'const files = "/site.webmanifest";',
    'const external = "https://example.com/x";',
    'const protocolRelative = "//cdn.example.com/x";',
  ])("lets through localized, external, file and separator paths: %s", (code) => {
    expect(inTs(code, rule)).toEqual([]);
  });

  it("flags a bare root link in markup", () => {
    expect(inSvelte('<a href="/">home</a>', rule)).toHaveLength(1);
    expect(inAstro('<a href="/">home</a>', rule)).toHaveLength(1);
  });

  it("flags markup attribute paths in Svelte and Astro", () => {
    expect(
      inSvelte('<script>let slug = "x";</script><a href="/product/{slug}/">x</a>', rule)
    ).toHaveLength(1);
    expect(inAstro('<a href="/terms">x</a>', rule)).toHaveLength(1);
    expect(inAstro('---\nconst t = "x";\n---\n<a href={`/${t}`}>x</a>', rule)).toHaveLength(1);
  });

  it("explains the fix", () => {
    expect(inTs('const href = "/checkout";', rule)[0]).toContain("localizedPath(path, locale)");
  });
});

describe("no-hungarian-text", () => {
  const rule = "no-hungarian-text";

  it.each([
    'const error = "Kötelező mező";',
    "const message = `${title}: a szett kedvezmény aktív`;",
  ])("flags Hungarian string literals: %s", (code) => {
    expect(inTs(code, rule)).toHaveLength(1);
  });

  it("flags Hungarian markup text and attributes", () => {
    expect(inSvelte("<p>Válaszz először opciót</p>", rule)).toHaveLength(1);
    expect(inSvelte('<input placeholder="Írj üzenetet" />', rule)).toHaveLength(1);
    expect(inAstro("<h2>1. Adatkezelő</h2>", rule)).toHaveLength(1);
  });

  it("lets English text and Hungarian comments through", () => {
    expect(inTs('// Kötelező mező\nconst error = "Required field";', rule)).toEqual([]);
    expect(inSvelte("<!-- Kötelező --><p>{i18n.t(key)}</p>", rule)).toEqual([]);
  });

  it("explains the fix", () => {
    expect(inTs('const error = "Kötelező mező";', rule)[0]).toContain("src/locales/hu.ts");
  });
});
