#!/usr/bin/env node
/**
 * Hourly prod database dump, installed as an hourly cron by the deploy
 * (runs on the Hetzner box under plain apt Node; stdlib only). Writes a
 * compressed pg_dump archive into /srv/babasarok/backups and keeps the
 * newest KEEP files (14 days) — the "undo a dashboard mistake" layer;
 * Hetzner's rotating server snapshots remain the disaster layer. Full
 * dumps, not incrementals: at this DB size a full archive costs under
 * 1 MB, while a backup chain adds combine steps and dependencies that
 * fail during the restore we would actually need.
 */
import {
  accessSync,
  closeSync,
  constants as fsConstants,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const CONTAINER = "babasarok-prod-postgres-1";
const DIR = "/srv/babasarok/backups";
const KEEP = 336;
// Optional label (e.g. "predeploy") — tagged dumps live alongside the hourly
// ones under their own name so a deploy dump cannot be overwritten by the
// next cron run within the hour.
const label = process.argv[2] === undefined ? "" : `${process.argv[2]}-`;

if (spawnSync("docker", ["inspect", CONTAINER]).status !== 0) {
  console.error(`${CONTAINER} not running, skipping`);
  process.exit(1);
}

try {
  mkdirSync(DIR, { recursive: true });
  accessSync(DIR, fsConstants.W_OK);
} catch {
  // A leftover root-owned empty dir blocks writes; it is removable because
  // its parent belongs to deploy. A non-empty one must fail loudly here.
  rmdirSync(DIR);
  mkdirSync(DIR);
}

const now = new Date();
const pad = (n: number): string => String(n).padStart(2, "0");
const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
const tmp = path.join(DIR, `.partial-${process.pid}.dump`);
const out = openSync(tmp, "w");
const dump = spawnSync(
  "docker",
  ["exec", CONTAINER, "pg_dump", "-Fc", "-U", "babasarok", "babasarok"],
  {
    stdio: ["ignore", out, "inherit"],
  }
);
closeSync(out);

if (dump.status !== 0) {
  unlinkSync(tmp);
  console.error("pg_dump failed");
  process.exit(1);
}

const target = path.join(DIR, `prod-${label}${stamp}.dump`);
rmSync(target, { force: true });
renameSync(tmp, target);
console.log(`dumped ${target} (${Math.round(statSync(target).size / 1024)} KiB)`);

for (const f of readdirSync(DIR)) {
  const full = path.join(DIR, f);
  if (f.startsWith(".partial-") && Date.now() - statSync(full).mtimeMs > 24 * 60 * 60 * 1000) {
    rmSync(full, { force: true });
  }
}

const dumps = readdirSync(DIR)
  .filter((f) => /^prod-(?:[a-z]+-)?\d{8}-\d{4}\.dump$/.test(f))
  .sort()
  .reverse();

for (const stale of dumps.slice(KEEP)) {
  rmSync(path.join(DIR, stale), { force: true });
  console.log(`pruned ${stale}`);
}
