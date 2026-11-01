/**
 * Type-checks the dashboard extension files (src/dashboard/tsconfig.json).
 *
 * The dashboard's own sources are part of the type-check closure (the
 * package ships its source as its types) and currently carry ~26 vendure-
 * internal type errors, so a plain tsc run cannot gate CI. This script
 * fails only when errors point at OUR extension files (src/dashboard),
 * where a missing import like an unimported component would otherwise
 * only surface at runtime.
 */
import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["tsc", "-p", "src/dashboard/tsconfig.json", "--noEmit"], {
  cwd: new URL("..", import.meta.url).pathname,
  encoding: "utf8",
});

const lines = (result.stdout ?? "").split("\n");
const ours = lines.filter((line) => /^src\/dashboard\//.test(line));
const vendureInternal = lines.filter((line) => /error TS/.test(line) && !ours.includes(line));

if (vendureInternal.length > 0) {
  console.log(
    `${vendureInternal.length} vendure-internal dashboard type errors (informational, ` +
      "from the package's shipped source):\n" +
      vendureInternal.slice(0, 5).join("\n")
  );
}

if (ours.length > 0) {
  console.error(`dashboard extension type errors:\n${ours.join("\n")}`);
  process.exit(1);
}
