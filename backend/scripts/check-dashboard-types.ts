/**
 * Type-checks the dashboard extension files (src/dashboard/tsconfig.json).
 *
 * The dashboard's own sources are part of the type-check closure (the
 * package ships its source as its types) and currently carry ~30 vendure-
 * internal type errors, so a plain tsc run cannot gate CI. This script
 * fails when errors point at OUR extension files (src/dashboard), at
 * anything unexpected (neither our files nor node_modules), or when tsc
 * did not actually run over our files.
 */
import { spawnSync } from "node:child_process";

// --listFiles makes tsc print the whole program's file list alongside the
// diagnostics, so one run proves our files were covered AND reports errors.
const result = spawnSync(
  "npx",
  ["tsc", "-p", "src/dashboard/tsconfig.json", "--noEmit", "--pretty", "false", "--listFiles"],
  {
    cwd: new URL("..", import.meta.url).pathname,
    encoding: "utf8",
  }
);

const lines = result.stdout.split("\n");
const errorLines = lines.filter((line) => line.includes("error TS"));
const ours = errorLines.filter((line) => line.includes("src/dashboard/"));
const vendureInternal = errorLines.filter(
  (line) => line.includes("node_modules/") && !ours.includes(line)
);
const unexpected = errorLines.filter(
  (line) => !ours.includes(line) && !vendureInternal.includes(line)
);

if (result.error !== undefined) {
  console.error(`dashboard type-check failed to run: ${result.error.message}`);
  process.exit(1);
}

if (
  !lines.some((line) => line.includes("src/dashboard/")) ||
  (result.status !== 0 && errorLines.length === 0)
) {
  console.error(
    `dashboard type-check did not run over our files (status ${String(result.status)}):\n` +
      result.stderr
  );
  process.exit(1);
}

if (vendureInternal.length > 0) {
  console.log(
    `${vendureInternal.length} vendure-internal dashboard type errors (informational, ` +
      "from the package's shipped source):\n" +
      vendureInternal.slice(0, 5).join("\n")
  );
}

if (unexpected.length > 0) {
  console.error(
    `unexpected dashboard type errors (neither our files nor node_modules):\n` +
      unexpected.join("\n")
  );
  process.exit(1);
}

if (ours.length > 0) {
  console.error(`dashboard extension type errors:\n${ours.join("\n")}`);
  process.exit(1);
}
