import "reflect-metadata";
import path from "node:path";
import { generateMigration } from "@vendure/core";
import { config } from "./vendure-config";

const name = process.argv[2];

if (!name) {
  console.error("Usage: node dist/generate-migration.js <name> [--from-empty]");
  process.exit(1);
}

// `--from-empty` diffs against a throwaway empty database instead of the
// configured one, producing a full zero-to-current-schema baseline.
const fromEmpty = process.argv.includes("--from-empty");

generateMigration(config, {
  name,
  fromEmpty,
  outputDir: path.join(__dirname, "..", "src", "migrations"),
})
  .then((file) => {
    console.log(file === undefined ? "No schema changes detected" : `Generated ${file}`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
