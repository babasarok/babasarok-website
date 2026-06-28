/**
 * Bootstrap 4 -> Tailwind 4 class report.
 *
 * Scans the old Hugo templates (`old/layouts/**`), SCSS (`old/assets/scss/**`)
 * and JS (`old/assets/js/**`), then classifies every class token used in the
 * markup so the manual Tailwind conversion has a clear plan:
 *
 *   - bootstrap     Utility with a 1:1 Tailwind 4 mapping.
 *   - component     Bootstrap behaviour that needs an Astro component
 *                   (buttons, navbar/mobile-menu, carousel, pagination).
 *                   Flagged when it relies on Bootstrap JS so we reimplement
 *                   it in Astro instead of shipping Bootstrap.
 *   - font-awesome  `fa-*` icon → Iconify name (we use astro-icon).
 *   - hugo          `$var` / template keyword leakage → Astro logic, not CSS.
 *   - custom        Class defined in the project SCSS. Recommended as a
 *                   component when used on multiple pages, else inline Tailwind.
 *   - unknown       Review manually — cross-check `old/assets/js` before removing.
 *
 * Classes referenced from `old/assets/js` are flagged (⚠ JS) everywhere so we
 * never delete behaviour that JavaScript depends on.
 *
 * Writes:
 *   scripts/migrate/.reports/bootstrap-classes.md   (human-readable)
 *   scripts/migrate/.reports/bootstrap-classes.json (machine-readable)
 *
 * Run: `node scripts/migrate/bootstrap-report.ts`
 */
import fs from "node:fs";
import path from "node:path";
import { OLD, REPORTS } from "./config.ts";
import { log, walk, writeJsonIfChanged, writeTextIfChanged } from "./lib.ts";

/* ------------------------------------------------------------------ *
 * Bootstrap utility -> Tailwind mapping
 * ------------------------------------------------------------------ */

/* Bootstrap 4 spacing scale -> Tailwind scale (BS spacer = 1rem). */
const BS_SPACER: Record<string, string> = {
  "0": "0",
  "1": "1", // .25rem
  "2": "2", // .5rem
  "3": "4", // 1rem
  "4": "6", // 1.5rem
  "5": "12", // 3rem
  auto: "auto",
};

/** Returns a Tailwind 4 utility string for a Bootstrap *utility*, or null. */
function suggestTailwind(cls: string): string | null {
  if (cls === "container") return "container mx-auto px-4";
  if (cls === "container-fluid") return "w-full px-4";
  if (cls === "row") return "flex flex-wrap -mx-4";

  // Grid columns: col, col-6, col-lg-4
  let m = cls.match(/^col(?:-(sm|md|lg|xl))?(?:-(\d{1,2}|auto))?$/);
  if (m) {
    const bp = m[1] ? `${m[1]}:` : "";
    if (!m[2]) return `${bp}flex-1`;
    if (m[2] === "auto") return `${bp}w-auto`;
    if (m[2] === "12") return `${bp}w-full`;
    const frac = `${m[2]}/12`;
    return `${bp}w-${frac} basis-${frac}`;
  }

  // Grid offsets: offset-lg-1 -> ml-[8.3333%]
  m = cls.match(/^offset(?:-(sm|md|lg|xl))?-(\d{1,2})$/);
  if (m) {
    const bp = m[1] ? `${m[1]}:` : "";
    const n = Number(m[2]);
    if (n === 0) return `${bp}ml-0`;
    const pct = +((n / 12) * 100).toFixed(4);
    return `${bp}ml-[${pct}%]`;
  }

  // Display: d-flex, d-none, d-md-block
  m = cls.match(/^d-(?:(sm|md|lg|xl)-)?(none|inline|inline-block|block|flex|inline-flex|grid)$/);
  if (m) {
    const bp = m[1] ? `${m[1]}:` : "";
    const map: Record<string, string> = {
      none: "hidden",
      inline: "inline",
      "inline-block": "inline-block",
      block: "block",
      flex: "flex",
      "inline-flex": "inline-flex",
      grid: "grid",
    };
    return `${bp}${map[m[2]]}`;
  }

  // Flex helpers
  m = cls.match(/^justify-content-(?:(sm|md|lg|xl)-)?(start|end|center|between|around|evenly)$/);
  if (m) return `${m[1] ? m[1] + ":" : ""}justify-${m[2]}`;
  m = cls.match(/^align-items-(?:(sm|md|lg|xl)-)?(start|end|center|baseline|stretch)$/);
  if (m) return `${m[1] ? m[1] + ":" : ""}items-${m[2]}`;
  m = cls.match(
    /^flex-(?:(sm|md|lg|xl)-)?(row|column|wrap|nowrap|fill|grow-0|grow-1|shrink-0|shrink-1)$/
  );
  if (m) {
    const bp = m[1] ? `${m[1]}:` : "";
    const map: Record<string, string> = {
      row: "flex-row",
      column: "flex-col",
      wrap: "flex-wrap",
      nowrap: "flex-nowrap",
      fill: "flex-1",
      "grow-0": "grow-0",
      "grow-1": "grow",
      "shrink-0": "shrink-0",
      "shrink-1": "shrink",
    };
    return `${bp}${map[m[2]]}`;
  }

  // Spacing: m-3, mt-2, mx-auto, py-4, p-0
  m = cls.match(/^([mp])([tbsexylr]?)-(?:(sm|md|lg|xl)-)?(0|1|2|3|4|5|auto)$/);
  if (m) {
    const [, mp, side, bp, size] = m;
    const scale = BS_SPACER[size] ?? size;
    return `${bp ? bp + ":" : ""}${mp}${side ?? ""}-${scale}`;
  }

  // Text alignment
  m = cls.match(/^text-(?:(sm|md|lg|xl)-)?(left|center|right|justify)$/);
  if (m) return `${m[1] ? m[1] + ":" : ""}text-${m[2]}`;

  const exact: Record<string, string> = {
    // colour
    "text-white": "text-white",
    "text-dark": "text-gray-900",
    "text-muted": "text-gray-500",
    "text-primary": "text-primary",
    "text-secondary": "text-gray-500",
    "bg-white": "bg-white",
    "bg-dark": "bg-gray-900",
    "bg-light": "bg-light",
    "bg-primary": "bg-primary",
    // type
    "font-weight-bold": "font-bold",
    "font-weight-normal": "font-normal",
    "font-weight-light": "font-light",
    "font-italic": "italic",
    small: "text-sm",
    "text-uppercase": "uppercase",
    "text-lowercase": "lowercase",
    "text-capitalize": "capitalize",
    "text-nowrap": "whitespace-nowrap",
    "text-decoration-none": "no-underline",
    // sizing
    "w-100": "w-full",
    "h-100": "h-full",
    "mw-100": "max-w-full",
    "mh-100": "max-h-full",
    "img-fluid": "max-w-full h-auto",
    // lists
    "list-unstyled": "list-none pl-0",
    "list-inline": "flex list-none pl-0",
    "list-inline-item": "inline-block",
    // misc
    rounded: "rounded",
    "rounded-circle": "rounded-full",
    "rounded-0": "rounded-none",
    shadow: "shadow",
    "shadow-sm": "shadow-sm",
    "shadow-lg": "shadow-lg",
    "shadow-none": "shadow-none",
    "position-relative": "relative",
    "position-absolute": "absolute",
    "position-fixed": "fixed",
    "fixed-top": "fixed top-0 inset-x-0 z-50",
    "sr-only": "sr-only",
    "overflow-hidden": "overflow-hidden",
    "align-middle": "align-middle",
  };
  return exact[cls] ?? null;
}

/* ------------------------------------------------------------------ *
 * Component / Font Awesome / Hugo classification
 * ------------------------------------------------------------------ */

/** Bootstrap classes that map to an Astro component instead of utilities. */
function suggestComponent(cls: string): string | null {
  if (/^btn(-|$)/.test(cls)) return "<Button> component";
  if (cls === "navbar" || cls.startsWith("navbar-"))
    return "<Header> component (custom Astro JS mobile menu — no Bootstrap JS)";
  if (cls === "nav-link" || cls === "nav-item" || cls === "nav")
    return "<Header> nav link (Astro, no Bootstrap JS)";
  if (cls === "collapse" || cls === "collapsed" || cls === "collapsing")
    return "mobile-menu toggle (Astro JS — replaces Bootstrap collapse)";
  if (cls === "carousel" || cls.startsWith("carousel-"))
    return "carousel component (custom Astro JS — replaces Bootstrap carousel)";
  if (cls === "pagination" || cls.startsWith("pagination-")) return "<Pagination> component";
  if (cls === "page-item" || cls === "page-link") return "<Pagination> component";
  return null;
}

/** Hugo template keywords that leak into scanned class attributes. */
const HUGO_KEYWORDS = new Set([
  "if",
  "else",
  "end",
  "with",
  "range",
  "define",
  "block",
  "partial",
  "and",
  "or",
  "not",
  "eq",
  "ne",
]);

function isHugoArtifact(cls: string): boolean {
  return cls.startsWith("$") || HUGO_KEYWORDS.has(cls);
}

/**
 * `fa-*` icon class -> Iconify name for astro-icon. The `fa` set is
 * FontAwesome 4 and shares FA4 class names, so most are a direct strip of
 * the `fa-` prefix. `fa`/`fa-ul`/`fa-li` are layout helpers, not icons.
 */
function suggestIconify(cls: string): string | null {
  if (cls === "fa") return "(icon base marker — use <Icon>)";
  if (cls === "fa-ul" || cls === "fa-li") return "icon list layout — use flex + <Icon>";
  if (!cls.startsWith("fa-")) return null;
  const name = cls.slice(3);
  const brands = /facebook|twitter|linkedin|instagram|youtube|pinterest|tiktok/;
  return brands.test(name) ? `fa-brands:${name}` : `fa:${name}`;
}

/* ------------------------------------------------------------------ *
 * JS cross-reference
 * ------------------------------------------------------------------ */

/** Class names referenced from `old/assets/js` (so we never drop them). */
function collectJsClasses(): Set<string> {
  const classes = new Set<string>();
  const patterns = [
    /classList\.(?:add|remove|toggle|contains|replace)\(\s*["'`]([^"'`]+)["'`]/g,
    /getElementsByClassName\(\s*["'`]([^"'`]+)["'`]/g,
    /(?:querySelector|querySelectorAll|closest|matches)\(\s*["'`]([^"'`]+)["'`]/g,
  ];
  for (const file of walk(path.join(OLD.assets, "js"))) {
    if (!/\.(ts|js|mjs)$/i.test(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const re of patterns) {
      for (const m of text.matchAll(re)) {
        // Pull bare class tokens out of selector strings (".a .b" -> a, b).
        for (const sel of m[1].split(/[\s,>+~]+/)) {
          for (const part of sel.split(".")) {
            const token = part.replace(/[:#\[].*$/, "").trim();
            if (token) classes.add(token);
          }
        }
      }
    }
  }
  return classes;
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

const CLASS_ATTR_RE = /class(?:Name)?\s*=\s*["']([^"']+)["']/g;
const SCSS_SELECTOR_RE = /\.([a-zA-Z_][\w-]*)/g;

type Category = "bootstrap" | "component" | "font-awesome" | "hugo" | "custom" | "unknown";

interface Row {
  class: string;
  count: number;
  category: Category;
  suggestion: string | null;
  files: string[];
  /** Recommendation for custom classes: "component" | "inline" | null. */
  recommend: string | null;
  /** Referenced from old/assets/js — do not remove blindly. */
  js: boolean;
}

function classify(
  cls: string,
  customClasses: Set<string>
): { category: Category; suggestion: string | null } {
  if (isHugoArtifact(cls))
    return {
      category: "hugo",
      suggestion: "Hugo logic — handle in Astro, not CSS",
    };
  const icon = suggestIconify(cls);
  if (icon) return { category: "font-awesome", suggestion: icon };
  const comp = suggestComponent(cls);
  if (comp) return { category: "component", suggestion: comp };
  const util = suggestTailwind(cls);
  if (util) return { category: "bootstrap", suggestion: util };
  if (customClasses.has(cls)) return { category: "custom", suggestion: null };
  return { category: "unknown", suggestion: null };
}

export function buildBootstrapReport(): void {
  log.step("Scanning old templates for Bootstrap classes");

  const customClasses = new Set<string>();
  for (const file of walk(OLD.scss)) {
    if (!/\.scss$/i.test(file)) continue;
    for (const m of fs.readFileSync(file, "utf8").matchAll(SCSS_SELECTOR_RE))
      customClasses.add(m[1]);
  }

  const jsClasses = collectJsClasses();

  const used = new Map<string, { count: number; files: Set<string> }>();
  for (const file of walk(OLD.layouts)) {
    if (!/\.html?$/i.test(file)) continue;
    const rel = path.relative(OLD.root, file);
    for (const m of fs.readFileSync(file, "utf8").matchAll(CLASS_ATTR_RE)) {
      for (const token of m[1].split(/\s+/)) {
        // Skip obvious Hugo template fragments (keep `$var` — handled below).
        if (!token || /[{}|()]/.test(token)) continue;
        const info = used.get(token) ?? { count: 0, files: new Set<string>() };
        info.count++;
        info.files.add(rel);
        used.set(token, info);
      }
    }
  }

  const rows: Row[] = [];
  for (const [cls, info] of used) {
    const { category, suggestion } = classify(cls, customClasses);
    const js = jsClasses.has(cls);
    const recommend =
      category === "custom"
        ? js
          ? "component (JS)"
          : info.files.size > 1
            ? "component"
            : "inline"
        : null;
    rows.push({
      class: cls,
      count: info.count,
      category,
      suggestion,
      files: [...info.files],
      recommend,
      js,
    });
  }
  rows.sort((a, b) => b.count - a.count || a.class.localeCompare(b.class));

  const allCategories: Category[] = [
    "bootstrap",
    "component",
    "font-awesome",
    "hugo",
    "custom",
    "unknown",
  ];
  const counts = Object.fromEntries(
    allCategories.map((c) => [c, rows.filter((r) => r.category === c).length])
  ) as Record<Category, number>;

  const jsRow = (r: Row) => (r.js ? " ⚠ JS" : "");
  const filtered = (c: Category) => rows.filter((r) => r.category === c);

  const md: string[] = [
    "# Bootstrap → Tailwind class report",
    "",
    `_Generated by \`scripts/migrate/bootstrap-report.ts\`. ${rows.length} distinct classes._`,
    "",
    `- **${counts.bootstrap}** bootstrap utilities → Tailwind`,
    `- **${counts.component}** component classes (Astro, no Bootstrap JS)`,
    `- **${counts["font-awesome"]}** Font Awesome icons → Iconify`,
    `- **${counts.custom}** custom SCSS classes`,
    `- **${counts.hugo}** Hugo template artifacts (ignore)`,
    `- **${counts.unknown}** unknown (review manually)`,
    "",
    "> ⚠ JS = referenced from `old/assets/js`; reimplement the behaviour, do not just drop the class.",
    "",
    "## Bootstrap utilities → Tailwind",
    "",
    "| Class | Uses | Tailwind 4 |",
    "| --- | --- | --- |",
    ...filtered("bootstrap").map(
      (r) => `| \`${r.class}\`${jsRow(r)} | ${r.count} | \`${r.suggestion}\` |`
    ),
    "",
    "## Components to build (replace Bootstrap JS with Astro)",
    "",
    "| Class | Uses | Component |",
    "| --- | --- | --- |",
    ...filtered("component").map(
      (r) => `| \`${r.class}\`${jsRow(r)} | ${r.count} | ${r.suggestion} |`
    ),
    "",
    "## Font Awesome → Iconify (astro-icon)",
    "",
    "| Class | Uses | Iconify |",
    "| --- | --- | --- |",
    ...filtered("font-awesome").map((r) => `| \`${r.class}\` | ${r.count} | \`${r.suggestion}\` |`),
    "",
    "## Project custom classes (port from SCSS)",
    "",
    "| Class | Uses | Pages | Recommendation |",
    "| --- | --- | --- | --- |",
    ...filtered("custom").map(
      (r) => `| \`${r.class}\`${jsRow(r)} | ${r.count} | ${r.files.length} | ${r.recommend} |`
    ),
    "",
    "## Hugo template artifacts (ignore — handle in Astro logic)",
    "",
    "| Token | Uses |",
    "| --- | --- |",
    ...filtered("hugo").map((r) => `| \`${r.class}\` | ${r.count} |`),
    "",
    "## Unknown / review manually",
    "",
    "_Cross-check `old/assets/js` before removing anything here._",
    "",
    "| Class | Uses |",
    "| --- | --- |",
    ...filtered("unknown").map((r) => `| \`${r.class}\`${jsRow(r)} | ${r.count} |`),
    "",
  ];

  writeTextIfChanged(path.join(REPORTS, "bootstrap-classes.md"), md.join("\n"));
  writeJsonIfChanged(path.join(REPORTS, "bootstrap-classes.json"), {
    counts,
    jsClasses: [...jsClasses].sort(),
    rows,
  });

  log.ok(
    `${rows.length} classes — ${counts.bootstrap} util, ${counts.component} component, ` +
      `${counts["font-awesome"]} icon, ${counts.custom} custom, ${counts.hugo} hugo, ${counts.unknown} unknown`
  );
  log.dim("report: scripts/migrate/.reports/bootstrap-classes.md");
}

// Run directly: `node scripts/migrate/bootstrap-report.ts`
if (import.meta.url === `file://${process.argv[1]}`) buildBootstrapReport();
