#!/usr/bin/env node
/**
 * Pull the production database into the local dev postgres. Dumps the prod
 * container on the Hetzner box over ssh (the same copy deploy-stack.ts makes
 * for previews), drops + recreates the local database, restores the dump, and
 * leaves schema catch-up to the `pnpm -C backend run migrate` that the
 * `db:pull-prod` script chains afterwards. The dump is taken BEFORE the local
 * database is touched, so a failed ssh changes nothing.
 *
 * Needs ssh access to the deploy box: DEPLOY_HOST and DEPLOY_USER (the same
 * vars the Cloudflare build deploy uses), the key available to your ssh agent
 * or as a file in DEPLOY_SSH_KEY. The local target is the compose postgres;
 * the database and user come from backend/.env's DATABASE_URL.
 *
 * Run from the repo root: pnpm run db:pull-prod
 */
import { spawnSync } from "node:child_process";
import { closeSync, openSync, readFileSync, statSync, unlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

const envSchema = z.object({
  DEPLOY_HOST: z.string().min(1),
  DEPLOY_USER: z.string().min(1),
  DEPLOY_SSH_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  die(
    "db:pull-prod needs ssh access to the deploy box: export DEPLOY_HOST and " +
      "DEPLOY_USER (the same vars the Cloudflare build deploy uses); the key " +
      "must be in your ssh agent or a file at DEPLOY_SSH_KEY."
  );
}

const databaseUrl = readFileSync(path.resolve(import.meta.dirname, "..", "backend", ".env"), "utf8")
  .split("\n")
  .filter((line) => line.startsWith("DATABASE_URL="))
  .at(0)
  ?.slice("DATABASE_URL=".length);

if (databaseUrl === undefined || !databaseUrl.startsWith("postgres")) {
  die("backend/.env has no postgres DATABASE_URL — cannot locate the local database.");
}

const url = new URL(databaseUrl);
const dbUser = url.username;
const dbName = url.pathname.slice(1).split("?")[0];

if (dbUser === "" || dbName === "") {
  die("backend/.env DATABASE_URL does not name a user and database.");
}

function run(command: string, args: readonly string[], input?: Buffer): Buffer {
  const result = spawnSync(command, args, {
    stdio: input === undefined ? ["ignore", "pipe", "inherit"] : ["pipe", "pipe", "inherit"],
    ...(input === undefined ? {} : { input }),
  });

  if (result.error !== undefined) {
    die(`${command} could not start: ${result.error.message}`);
  }

  if (result.status !== 0) {
    die(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }

  return result.stdout;
}

const sshArgs = [
  ...(process.env.DEPLOY_SSH_KEY === undefined ? [] : ["-i", process.env.DEPLOY_SSH_KEY]),
  "-o",
  "BatchMode=yes",
  `${parsed.data.DEPLOY_USER}@${parsed.data.DEPLOY_HOST}`,
  "docker",
  "exec",
  "babasarok-prod-postgres-1",
  "pg_dump",
  "-U",
  "babasarok",
  "-d",
  "babasarok",
];

console.log("→ dumping the production database over ssh…");
// Streamed to a file, not captured: spawnSync's stdout capture dies with
// ENOBUFS on a real prod dump (its maxBuffer is a few hundred KiB).
const dumpPath = path.join(os.tmpdir(), "babasarok-prod-dump.sql");
const dumpFd = openSync(dumpPath, "w");
const dumpResult = spawnSync("ssh", sshArgs, { stdio: ["ignore", dumpFd, "inherit"] });
closeSync(dumpFd);

if (dumpResult.error !== undefined) {
  die(`ssh could not start: ${dumpResult.error.message}`);
}

if (dumpResult.status !== 0) {
  die(`ssh pg_dump failed with exit code ${dumpResult.status}`);
}

const dumpSize = statSync(dumpPath).size;

if (dumpSize === 0) {
  unlinkSync(dumpPath);
  die("the ssh dump came back empty — refusing to wipe the local database.");
}

const psql = (args: readonly string[], input?: Buffer): Buffer =>
  run("docker", ["compose", "exec", "-T", "postgres", "psql", "-U", dbUser, ...args], input);

console.log(`→ dropping and recreating the local database "${dbName}"…`);
psql(["-d", "postgres", "-c", `DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`]);
psql(["-d", "postgres", "-c", `CREATE DATABASE "${dbName}"`]);

console.log(`→ restoring ${Math.round(dumpSize / 1024 / 1024)} MiB into "${dbName}"…`);
psql(["-d", dbName, "-v", "ON_ERROR_STOP=1", "-q"], readFileSync(dumpPath));
unlinkSync(dumpPath);

console.log("done — the chained migrate step brings the schema up to local HEAD.");
