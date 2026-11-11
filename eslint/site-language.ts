/**
 * Site language guards (ADR 0015): every page exists per locale, so an
 * internal link must carry the page's locale, and buyer-visible text must come
 * from the locale files so English pages never show Hungarian.
 */
import type { Rule } from "eslint";

const ADR = "See docs/adr/0015-multi-language-site-architecture.md.";

export const siteLanguageFiles = ["src/**/*.ts", "src/**/*.astro", "src/**/*.svelte"];

export const siteLanguageIgnores = [
  "src/**/*.test.ts",
  "src/lib/__tests__/**",
  "src/locales/**",
  "src/content/**",
];

/** Files whose root-relative paths are not page links. Only shrinks. */
export const localizedPathAllowlist = [
  // Defines localizedPath and the locale prefixes it maps between.
  "src/lib/i18n.ts",
  // The catalog sitemap lists every route once and adds the locale alternates itself.
  "src/lib/catalog/sitemap.ts",
  // The RSS feed is the Hungarian blog only.
  "src/pages/rss.xml.ts",
  // API endpoint and proxy routes, not pages.
  "src/lib/errorReport.ts",
  String.raw`src/pages/dashboard/\[...slug\].ts`,
  String.raw`src/pages/src/assets/\[...path\].ts`,
];

/** Files whose Hungarian text is not buyer-visible UI copy. Only shrinks. */
export const hungarianTextAllowlist = [
  // A bilingual table: productTypeLabel picks label or labelEn by locale.
  "src/lib/product/productTypes.ts",
  // Labels for the Tina admin's field-type picker; the site never renders them.
  "src/lib/product/fieldTypes.ts",
  // The RSS feed is the Hungarian blog only.
  "src/pages/rss.xml.ts",
];

const INTERNAL_PATH = /^\/(?!\/)/;
const FILE_PATH = /\.[a-z0-9]+(?:[?#].*)?$/i;
const HUNGARIAN_LETTER = /[áéíóöőúüű]/i;

function isInternalPath(text: string): boolean {
  return INTERNAL_PATH.test(text) && !FILE_PATH.test(text);
}

interface TextNode {
  node: Rule.Node;
  text: string;
  /** False when `text` only starts the value, e.g. the "/" of `/${target}`. */
  whole?: boolean;
}

/** The path argument of `localizedPath`, looking through `a ? "/x" : "/y"` and `a ?? "/x"`. */
function isLocalizedPathArgument(node: Rule.Node): boolean {
  let argument: Rule.Node = node;
  let parent: Rule.Node | null = node.parent;

  while (
    parent !== null &&
    (parent.type === "ConditionalExpression" || parent.type === "LogicalExpression")
  ) {
    argument = parent;
    parent = parent.parent;
  }

  if (parent === null || parent.type !== "CallExpression") {
    return false;
  }

  return (
    parent.callee.type === "Identifier" &&
    parent.callee.name === "localizedPath" &&
    parent.arguments[0] === argument
  );
}

function isMarkupAttribute(node: Rule.Node): boolean {
  const parent: unknown = node.parent;

  return (
    typeof parent === "object" &&
    parent !== null &&
    "type" in parent &&
    (parent.type === "JSXAttribute" || parent.type === "SvelteAttribute")
  );
}

function stringValue(node: Rule.Node): string | undefined {
  if (!("value" in node) || typeof node.value !== "string") {
    return undefined;
  }

  return node.value;
}

/** A Svelte attribute value split around `{…}`: only its leading piece starts the URL. */
function leadsSvelteAttribute(node: Rule.Node): boolean {
  const parent: unknown = node.parent;

  if (typeof parent !== "object" || parent === null || !("value" in parent)) {
    return false;
  }

  return Array.isArray(parent.value) && parent.value[0] === node;
}

const localizedPaths: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Internal links are built with localizedPath." },
    schema: [],
    messages: {
      unlocalized: `The internal path "{{path}}" is not localized, so an English page would link to the Hungarian one. Build it with \`localizedPath(path, locale)\` from "@/lib/i18n" (the path literal as its first argument). ${ADR}`,
    },
  },
  create(context) {
    function check({ node, text, whole = true }: TextNode): void {
      if (!isInternalPath(text) || isLocalizedPathArgument(node)) {
        return;
      }

      // A bare "/" in code is a comparison or a separator; as a link it is markup.
      if (whole && text === "/" && !isMarkupAttribute(node)) {
        return;
      }

      context.report({ node, messageId: "unlocalized", data: { path: text } });
    }

    return {
      Literal(node) {
        const value = stringValue(node);

        if (value !== undefined) {
          check({ node, text: value });
        }
      },
      TemplateLiteral(node) {
        check({
          node,
          text: node.quasis[0].value.cooked ?? "",
          whole: node.expressions.length === 0,
        });
      },
      SvelteLiteral(node: Rule.Node) {
        const value = stringValue(node);

        if (value !== undefined && leadsSvelteAttribute(node)) {
          check({ node, text: value });
        }
      },
    };
  },
};

const noHungarianText: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: { description: "Buyer-visible text comes from the locale files." },
    schema: [],
    messages: {
      hungarian: `Hungarian text in code: "{{text}}". English pages would show it untranslated. Add a key to src/locales/hu.ts and src/locales/en.ts and render it with \`i18n.t(key)\` (or \`t(key)\` in .astro); data the CMS edits belongs in src/content. ${ADR}`,
    },
  },
  create(context) {
    function check({ node, text }: TextNode): void {
      if (!HUNGARIAN_LETTER.test(text)) {
        return;
      }

      context.report({ node, messageId: "hungarian", data: { text: text.trim().slice(0, 60) } });
    }

    function checkValue(node: Rule.Node): void {
      const value = stringValue(node);

      if (value !== undefined) {
        check({ node, text: value });
      }
    }

    return {
      Literal: checkValue,
      TemplateElement(node) {
        check({ node, text: node.value.cooked ?? node.value.raw });
      },
      JSXText: checkValue,
      SvelteText: checkValue,
      SvelteLiteral: checkValue,
    };
  },
};

export const siteLanguagePlugin = {
  rules: {
    "localized-paths": localizedPaths,
    "no-hungarian-text": noHungarianText,
  },
};
