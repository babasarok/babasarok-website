import "reflect-metadata";
import path from "node:path";
import { compileUiExtensions } from "@vendure/ui-devkit/compiler";

// One-off build of the Admin UI with the Hungarian language pack; the output
// (backend/admin-ui) is gitignored and served by AdminUiPlugin when present.
async function main(): Promise<void> {
  const app = compileUiExtensions({
    outputPath: path.join(__dirname, "..", "admin-ui"),
    baseHref: "/admin-ui",
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
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
