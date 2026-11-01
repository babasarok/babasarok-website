import "reflect-metadata";
import { bootstrap, runMigrations } from "@vendure/core";
import { config } from "./vendure-config";

runMigrations(config)
  .then(() => bootstrap(config))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
