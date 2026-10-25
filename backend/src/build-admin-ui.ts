import "reflect-metadata";
import fs from "node:fs";
import path from "node:path";
import { compileUiExtensions } from "@vendure/ui-devkit/compiler";
import { adminUiBuildPath, adminUiDistPath } from "./paths";

// One-off build of the Admin UI with the Hungarian language pack; the output
// (~/.cache/babasarok-admin-ui) is served by AdminUiPlugin when present.
// The scaffold does not self-install (dependency-less package.json) and
// compileUiExtensions does not run installs — see docs/vendure-migration.md
// for the manual bootstrap of the scaffold's node_modules.
async function main(): Promise<void> {
  const app = compileUiExtensions({
    outputPath: adminUiBuildPath,
    baseHref: "/admin-ui",
    // The scaffold defaults to yarn, which trips over the repo's
    // packageManager field; build with the repo's package manager.
    command: "pnpm",
    extensions: [
      {
        translations: {
          hu: path.join(__dirname, "..", "ui-translations", "hu.json"),
        },
      },
    ],
  });

  if (app.compile === undefined) {
    console.error("The compiled Admin UI config exposes no compile() step");
    process.exit(1);
  }
  await app.compile();

  // AdminUiPlugin serves <app-path> as the static root (expects index.html
  // there) and overwrites (but does not create) vendure-ui-config.json at
  // boot. Angular 19's application builder outputs to dist/browser; the
  // built app is copied into the committed repo artifact that AdminUiPlugin
  // actually serves.
  const browserPath = path.join(adminUiBuildPath, "dist", "browser");
  // Source maps (~20 MB) stay in the scaffold's dist for local debugging;
  // the committed artifact ships without them (or stray backup files).
  fs.cpSync(browserPath, adminUiDistPath, {
    recursive: true,
    filter: (src) => !src.endsWith(".map") && !src.endsWith(".bak"),
  });
  // The package exports map hides ./static, so resolve via its package.json.
  const pkgDir = path.dirname(require.resolve("@vendure/admin-ui/package.json"));
  const configSource = path.join(pkgDir, "static", "vendure-ui-config.json");
  fs.copyFileSync(configSource, path.join(adminUiDistPath, "vendure-ui-config.json"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
