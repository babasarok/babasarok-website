import os from "node:os";
import path from "node:path";

// Build-time output of the custom Admin UI scaffold; lives outside the repo
// because the ui-devkit scaffold installs its own dependencies, which pnpm
// would resolve against the repo workspace if the output lived inside it.
export const adminUiBuildPath = `${os.homedir()}/.cache/babasarok-admin-ui`;

// The served Admin UI artifact (committed to the repo, see
// docs/vendure-migration.md); overridable per environment. Relative to the
// compiled dist/ directory at runtime.
export const adminUiDistPath =
  process.env.ADMIN_UI_PATH ?? path.join(__dirname, "..", "admin-ui-dist");
