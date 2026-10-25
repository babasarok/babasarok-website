import "reflect-metadata";
import { generateMigration } from "@vendure/core";
import { config } from "./vendure-config";

const name = process.argv[2];

if (!name) {
  console.error("Usage: node dist/generate-migration.js <name>");
  process.exit(1);
}

generateMigration(config, { name })
  .then((file) => {
    console.log(file === undefined ? "No schema changes detected" : `Generated ${file}`);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
