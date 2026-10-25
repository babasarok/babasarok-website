import "reflect-metadata";
import fs from "node:fs";
import path from "node:path";
import { compileUiExtensions } from "@vendure/ui-devkit/compiler";
import { adminUiOutputPath } from "./paths";

// One-off build of the Admin UI with the Hungarian language pack; the output
// (~/.cache/babasarok-admin-ui) is served by AdminUiPlugin when present.
// The scaffold does not self-install (dependency-less package.json) and
// compileUiExtensions does not run installs — see docs/vendure-migration.md
// for the manual bootstrap of the scaffold's node_modules.
async function main(): Promise<void> {
  const app = compileUiExtensions({
    outputPath: adminUiOutputPath,
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
  // boot. Angular 19's application builder outputs to dist/browser.
  const browserPath = path.join(adminUiOutputPath, "dist", "browser");
  const configSource = require.resolve("@vendure/admin-ui/static/vendure-ui-config.json");
  fs.copyFileSync(configSource, path.join(browserPath, "vendure-ui-config.json"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
