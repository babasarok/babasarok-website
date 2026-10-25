import os from "node:os";

// Outside the repo on purpose: the ui-devkit scaffold installs its own
// dependencies, which pnpm would resolve against the repo workspace if the
// output lived inside it.
export const adminUiOutputPath = `${os.homedir()}/.cache/babasarok-admin-ui`;
