/**
 * Bootstrap 4 -> Tailwind 4 class report.
 *
 * Scans the old Hugo templates (`old/layouts/**`) and SCSS
 * (`old/assets/scss/**`) for every class token, classifies each as a
 * Bootstrap utility, a project-defined custom class, or unknown, and
 * proposes a Tailwind 4 equivalent. The output guides the manual
 * conversion and flags Bootstrap-only behaviour that needs a component
 * (e.g. `.btn-primary` -> `Button.astro`).
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

/* Bootstrap 4 spacing scale -> rem (used to map m- and p- utilities). */
const BS_SPACER: Record<string, string> = {
  "0": "0",
  "1": "1", // .25rem
  "2": "2", // .5rem
  "3": "4", // 1rem
  "4": "6", // 1.5rem
  "5": "12", // 3rem
  auto: "auto",
};

const SIDE: Record<string, string> = {
  t: "t",
  b: "b",
  s: "s",
  e: "e",
  l: "l",
  r: "r",
  x: "x",
  y: "y",
};

/** Returns a Tailwind 4 suggestion for a Bootstrap class, or null. */
function suggestTailwind(cls: string): string | null {
  // Components that have no 1:1 utility mapping.
  if (/^btn(-|$)/.test(cls)) return "→ <Button> component";
  if (cls === "container") return "container mx-auto px-4";
  if (cls === "container-fluid") return "w-full px-4";
  if (cls === "row") return "flex flex-wrap -mx-4";
  if (cls === "navbar" || cls.startsWith("navbar-"))
    return "→ <Header> component";
  if (cls === "carousel" || cls.startsWith("carousel-"))
    return "→ carousel component";

  // Grid columns: col, col-6, col-lg-4
  let m = cls.match(/^col(?:-(sm|md|lg|xl))?(?:-(\d{1,2}|auto))?$/);
  if (m) {
    const bp = m[1] ? `${m[1]}:` : "";
    if (!m[2]) return `${bp}flex-1`;
    if (m[2] === "auto") return `${bp}w-auto`;
    const frac = `${m[2]}/12`;
    return `${bp}w-${frac} basis-${frac}`;
  }

  // Display: d-flex, d-none, d-md-block
  m = cls.match(
    /^d-(?:(sm|md|lg|xl)-)?(none|inline|inline-block|block|flex|inline-flex|grid)$/,
  );
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
  m = cls.match(
    /^justify-content-(?:(sm|md|lg|xl)-)?(start|end|center|between|around|evenly)$/,
  );
  if (m) return `${m[1] ? m[1] + ":" : ""}justify-${m[2]}`;
  m = cls.match(
    /^align-items-(?:(sm|md|lg|xl)-)?(start|end|center|baseline|stretch)$/,
  );
  if (m) return `${m[1] ? m[1] + ":" : ""}items-${m[2]}`;
  m = cls.match(
    /^flex-(?:(sm|md|lg|xl)-)?(row|column|wrap|nowrap|fill|grow-0|grow-1|shrink-0|shrink-1)$/,
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
    const prefix = mp === "m" ? "m" : "p";
    const sidePart = side ? (SIDE[side] ?? "") : "";
    const scale = BS_SPACER[size] ?? size;
    return `${bp ? bp + ":" : ""}${prefix}${sidePart}-${scale}`;
  }

  // Text
  m = cls.match(/^text-(?:(sm|md|lg|xl)-)?(left|center|right|justify)$/);
  if (m)
    return `${m[1] ? m[1] + ":" : ""}text-${m[2] === "left" ? "left" : m[2]}`;
  const textColor: Record<string, string> = {
    "text-white": "text-white",
    "text-dark": "text-gray-900",
    "text-muted": "text-gray-500",
    "text-primary": "text-primary",
    "text-secondary": "text-gray-500",
  };
  if (textColor[cls]) return textColor[cls];
  const bgColor: Record<string, string> = {
    "bg-white": "bg-white",
    "bg-dark": "bg-gray-900",
    "bg-light": "bg-light",
    "bg-primary": "bg-primary",
  };
  if (bgColor[cls]) return bgColor[cls];

  // Type / weight
  const misc: Record<string, string> = {
    "font-weight-bold": "font-bold",
    "font-weight-normal": "font-normal",
    "font-weight-light": "font-light",
    "font-italic": "italic",
    "text-uppercase": "uppercase",
    "text-lowercase": "lowercase",
    "text-capitalize": "capitalize",
    "text-nowrap": "whitespace-nowrap",
    "w-100": "w-full",
    "h-100": "h-full",
    "mw-100": "max-w-full",
    "mh-100": "max-h-full",
    "img-fluid": "max-w-full h-auto",
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
    "d-block": "block",
    "sr-only": "sr-only",
    "list-unstyled": "list-none pl-0",
    "text-decoration-none": "no-underline",
    "overflow-hidden": "overflow-hidden",
    "align-middle": "align-middle",
  };
  if (misc[cls]) return misc[cls];

  return null;
}

const CLASS_ATTR_RE = /class(?:Name)?\s*=\s*["']([^"']+)["']/g;
const SCSS_SELECTOR_RE = /\.([a-zA-Z_][\w-]*)/g;

interface ClassInfo {
  count: number;
  files: Set<string>;
}

export function buildBootstrapReport(): void {
  log.step("Scanning old templates for Bootstrap classes");

  // Custom classes = those defined as selectors in the project SCSS.
  const customClasses = new Set<string>();
  for (const file of walk(OLD.scss)) {
    if (!/\.scss$/i.test(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(SCSS_SELECTOR_RE)) customClasses.add(m[1]);
  }

  const used = new Map<string, ClassInfo>();
  for (const file of walk(OLD.layouts)) {
    if (!/\.html?$/i.test(file)) continue;
    const rel = path.relative(OLD.root, file);
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(CLASS_ATTR_RE)) {
      for (const token of m[1].split(/\s+/)) {
        // Skip Hugo template fragments that leak into class attrs.
        if (!token || /[{}|()]/.test(token)) continue;
        const info = used.get(token) ?? { count: 0, files: new Set() };
        info.count++;
        info.files.add(rel);
        used.set(token, info);
      }
    }
  }

  type Row = {
    class: string;
    count: number;
    type: "bootstrap" | "custom" | "unknown";
    tailwind: string | null;
    files: string[];
  };

  const rows: Row[] = [];
  for (const [cls, info] of used) {
    const tailwind = suggestTailwind(cls);
    const type: Row["type"] = tailwind
      ? "bootstrap"
      : customClasses.has(cls)
        ? "custom"
        : "unknown";
    rows.push({
      class: cls,
      count: info.count,
      type,
      tailwind,
      files: [...info.files],
    });
  }
  rows.sort((a, b) => b.count - a.count || a.class.localeCompare(b.class));

  const counts = {
    bootstrap: rows.filter((r) => r.type === "bootstrap").length,
    custom: rows.filter((r) => r.type === "custom").length,
    unknown: rows.filter((r) => r.type === "unknown").length,
  };

  // Markdown report
  const md: string[] = [
    "# Bootstrap → Tailwind class report",
    "",
    `_Generated by \`scripts/migrate/bootstrap-report.ts\`. ${rows.length} distinct classes ` +
      `(${counts.bootstrap} bootstrap, ${counts.custom} custom, ${counts.unknown} unknown)._`,
    "",
    "## Bootstrap utilities → Tailwind",
    "",
    "| Class | Uses | Tailwind 4 |",
    "| --- | --- | --- |",
    ...rows
      .filter((r) => r.type === "bootstrap")
      .map((r) => `| \`${r.class}\` | ${r.count} | \`${r.tailwind}\` |`),
    "",
    "## Project custom classes (port from SCSS)",
    "",
    "| Class | Uses |",
    "| --- | --- |",
    ...rows
      .filter((r) => r.type === "custom")
      .map((r) => `| \`${r.class}\` | ${r.count} |`),
    "",
    "## Unknown / review manually",
    "",
    "| Class | Uses |",
    "| --- | --- |",
    ...rows
      .filter((r) => r.type === "unknown")
      .map((r) => `| \`${r.class}\` | ${r.count} |`),
    "",
  ];

  writeTextIfChanged(path.join(REPORTS, "bootstrap-classes.md"), md.join("\n"));
  writeJsonIfChanged(path.join(REPORTS, "bootstrap-classes.json"), {
    counts,
    rows,
  });

  log.ok(
    `${rows.length} classes (${counts.bootstrap} bootstrap, ${counts.custom} custom, ${counts.unknown} unknown)`,
  );
  log.dim("report: scripts/migrate/.reports/bootstrap-classes.md");
}

// Run directly: `node scripts/migrate/bootstrap-report.ts`
if (import.meta.url === `file://${process.argv[1]}`) buildBootstrapReport();
