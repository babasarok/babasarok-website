import "reflect-metadata";
import { runMigrations } from "@vendure/core";
import { config } from "./vendure-config";

runMigrations(config)
  .then((applied) => {
    for (const migration of applied) {
      console.log(`Applied migration ${migration}`);
    }
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
