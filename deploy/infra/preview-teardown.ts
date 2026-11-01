#!/usr/bin/env node
/**
 * Preview stack teardown, installed as an hourly cron by the deploy
 * (runs on the Hetzner box under plain apt Node; stdlib only). For each
 * preview stack — the dirs carrying a branch.txt marker — if its branch no
 * longer exists on origin, remove the compose project, its branch database
 * (inside the shared preview postgres in the infra stack), its caddy route
 * file and its directory. prod/infra and dirs without the marker are never
 * touched.
 *
 * The repo is public, so git ls-remote works unauthenticated.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";

const REPO_URL = "https://github.com/babasarok/babasarok-website.git";
const ROOT = "/srv/babasarok";
const SHARED_PG = "babasarok-edge-postgres-1";

function compose(args: string[], cwd: string): void {
  execFileSync("docker", ["compose", ...args], { cwd, stdio: "inherit" });
}

/** Only tear down on a definitive "branch gone" (ls-remote exit 2). Any
 * other failure (network outage, GitHub down) must skip — tearing down on
 * a transient error would delete live stacks. */
function branchExists(branch: string): boolean | undefined {
  const r = spawnSync(
    "git",
    ["ls-remote", "--exit-code", "--heads", REPO_URL, `refs/heads/${branch}`],
    {
      stdio: "ignore",
    }
  );
  if (r.status === 0) {
    return true;
  }
  if (r.status === 2) {
    return false;
  }
  return undefined;
}

let changed = false;

for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
  if (!entry.isDirectory() || !existsSync(`${ROOT}/${entry.name}/branch.txt`)) {
    continue;
  }
  const stack = entry.name;
  const dir = `${ROOT}/${stack}`;
  const branch = readFileSync(`${dir}/branch.txt`, "utf8").trim();
  const exists = branchExists(branch);
  if (exists !== false) {
    if (exists === undefined) {
      console.error(`ls-remote failed for '${branch}'; skipping to avoid false teardown`);
    }
    continue;
  }
  console.log(`branch '${branch}' no longer exists on origin; tearing down ${stack}`);
  compose(["-p", `babasarok-${stack}`, "down"], dir);
  execFileSync(
    "docker",
    [
      "exec",
      SHARED_PG,
      "psql",
      "-U",
      "babasarok",
      "-d",
      "postgres",
      "-c",
      `DROP DATABASE IF EXISTS "babasarok_preview_${stack}" WITH (FORCE)`,
    ],
    { stdio: "inherit" }
  );
  rmSync(dir, { recursive: true, force: true });
  rmSync(`${ROOT}/infra/previews/${stack}.caddy`, { force: true });
  changed = true;
}

if (changed) {
  compose(
    ["exec", "-T", "caddy", "caddy", "reload", "--force", "/etc/caddy/Caddyfile"],
    `${ROOT}/infra`
  );
}
