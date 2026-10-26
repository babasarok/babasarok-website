#!/usr/bin/env node
/**
 * Deploy the backend stack to the Hetzner box, health-gate it, then ship the
 * frontend (wrangler). Runs INSIDE the Cloudflare Workers build process
 * (the `pnpm run deploy` command; not GitHub Actions).
 *
 * Requires (Cloudflare build env vars): DEPLOY_HOST, DEPLOY_USER,
 * DEPLOY_SSH_KEY, and DEPLOY_STACK:
 *   prod    — fixed stack under /srv/babasarok/prod
 *   preview — per-branch stack; WORKERS_CI_BRANCH (injected by Workers
 *             Builds) names the stack dir, compose project and database
 *
 * Everything that mutates the stack (per-stack flock serialisation,
 * stale-commit refusal, health gate, rollback, edge Caddy refresh, teardown
 * cron install) lives in deploy/remote/deploy-stack.ts, which is shipped
 * inside the tar and runs on the box. A failed or stale backend exits
 * nonzero, so the `&&` in the deploy script skips wrangler — the frontend
 * can never deploy from a different commit (the tree shipped to the box IS
 * this commit).
 */
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { previewSlug } from "../src/lib/preview-slug.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

const envSchema = z.object({
  DEPLOY_HOST: z.string().min(1),
  DEPLOY_USER: z.string().min(1),
  DEPLOY_STACK: z.enum(["prod", "preview"]),
  DEPLOY_SSH_KEY: z.string().min(1),
  WORKERS_CI_BRANCH: z.string().min(1).optional(),
  CLOUDFLARE_EMAIL_TOKEN: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  die(
    `deploy env invalid:\n${parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`
  );
}

const cfg = parsed.data;

let branch = "";
let slug = "";
if (cfg.DEPLOY_STACK === "preview") {
  if (!cfg.WORKERS_CI_BRANCH) {
    die("WORKERS_CI_BRANCH must be set (Workers Builds injects it)");
  }
  branch = cfg.WORKERS_CI_BRANCH;
  if (/['"\\]/.test(branch)) {
    die("WORKERS_CI_BRANCH contains a quote character, refusing");
  }
  slug = previewSlug(branch);
}

const stack = slug || cfg.DEPLOY_STACK;
const dir = `/srv/babasarok/${stack}`;

function git(args: string[]): string {
  const r = spawnSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
  if (r.status !== 0 || !r.stdout) {
    die(`git ${args.join(" ")} failed`);
  }
  return r.stdout.trim();
}

const commitSha = git(["rev-parse", "HEAD"]);
const commitTs = git(["show", "-s", "--format=%ct", "HEAD"]);

const tmp = mkdtempSync(path.join(tmpdir(), "babasarok-deploy-"));

try {
  const keyfile = path.join(tmp, "key");
  // Cloudflare build env can mangle multi-line secrets (newlines stripped or
  // turned into spaces), corrupting a PEM key. A base64-encoded key survives;
  // accept both forms.
  if (cfg.DEPLOY_SSH_KEY.includes("-----BEGIN")) {
    writeFileSync(
      keyfile,
      cfg.DEPLOY_SSH_KEY.endsWith("\n") ? cfg.DEPLOY_SSH_KEY : `${cfg.DEPLOY_SSH_KEY}\n`
    );
  } else {
    writeFileSync(keyfile, Buffer.from(cfg.DEPLOY_SSH_KEY, "base64"));
  }
  chmodSync(keyfile, 0o600);

  function sshArgs(command: string[]): string[] {
    return [
      "-i",
      keyfile,
      "-o",
      "StrictHostKeyChecking=accept-new",
      `${cfg.DEPLOY_USER}@${cfg.DEPLOY_HOST}`,
      ...command,
    ];
  }

  // Fresh tree each deploy: no stale files, no rsync dependency in the build
  // image. The .env lives outside repo/ so it is never touched by deploys.
  // The tree lands in a per-build tar first — only the locked remote script
  // touches the live repo dir, so an overlapping deploy cannot corrupt a
  // transfer in flight.
  const tarfile = `${dir}/incoming-${process.pid}.tar`;
  const tarLocal = path.join(tmp, "tree.tar");

  const tar = spawnSync(
    "tar",
    [
      "-cf",
      tarLocal,
      "--exclude-vcs",
      "--exclude=backend/node_modules",
      "--exclude=backend/dist",
      "--exclude=backend/email-out",
      "--exclude=backend/.env",
      "--exclude=backend/.env.*",
      "package.json",
      "pnpm-workspace.yaml",
      "pnpm-lock.yaml",
      "Dockerfile",
      ".dockerignore",
      "backend",
      "deploy",
    ],
    { cwd: REPO_ROOT, stdio: "inherit" }
  );
  if (tar.status !== 0) {
    die("tar failed");
  }

  const mkdir = spawnSync("ssh", sshArgs(["mkdir", "-p", dir]), { stdio: "inherit" });
  if (mkdir.status !== 0) {
    die("ssh mkdir failed");
  }

  const put = spawnSync("ssh", sshArgs(["cat", ">", tarfile]), {
    input: readFileSync(tarLocal),
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (put.status !== 0) {
    die("tar transfer failed");
  }

  // Cloudflare-owned runtime secrets: written from the build env so rotation
  // in the cloudflare dashboard propagates on the next deploy. Only
  // allowlisted keys are carried; anything absent leaves the box's
  // bootstrapped value. Piped via stdin (the secret never appears in the
  // remote command line) into a per-build temp file that the locked remote
  // script atomically moves into place — concurrent writes cannot tear the
  // live file. Previews get no fragment: their compose has no .env.cloudflare
  // entry and their .env has no email transport at all.
  let secretTmp = "";
  if (cfg.DEPLOY_STACK !== "preview") {
    secretTmp = `${dir}/.env.cloudflare-${process.pid}.tmp`;
    const lines: string[] = [];
    if (cfg.CLOUDFLARE_EMAIL_TOKEN) {
      lines.push(`CLOUDFLARE_EMAIL_TOKEN=${cfg.CLOUDFLARE_EMAIL_TOKEN}`);
    }
    if (cfg.CLOUDFLARE_ACCOUNT_ID) {
      lines.push(`CLOUDFLARE_ACCOUNT_ID=${cfg.CLOUDFLARE_ACCOUNT_ID}`);
    }
    const putSecrets = spawnSync("ssh", sshArgs(["cat", ">", secretTmp]), {
      input: `${lines.join("\n")}\n`,
      stdio: ["pipe", "inherit", "inherit"],
    });
    if (putSecrets.status !== 0) {
      die("secret fragment transfer failed");
    }
  }

  // Everything that mutates the stack runs under the two flock'd locks taken
  // by this bootstrap before the remote script runs. Arguments were
  // pre-validated above (no shell metacharacters reach the remote shell).
  const bootstrap = `set -euo pipefail
DIR="/srv/babasarok/$2"
TARFILE=$7

# One box-wide lock for the whole deploy: besides serialising this stack it
# keeps prod and preview deploys from racing the shared infra stack
# (networks override, Caddyfile, caddy reload). Not try-lock: waiting here is
# the concurrency limit for image builds, not a failure.
mkdir -p /srv/babasarok
exec 8>>/srv/babasarok/.infra.lock
flock -x -w 900 8

mkdir -p "$DIR"
exec 9>>"$DIR/.deploy.lock"
if ! flock -x -w 600 9; then
  echo "timed out waiting for the deploy lock" >&2
  exit 1
fi

command -v node >/dev/null 2>&1 || {
  echo "node is not installed on the deploy box" >&2
  exit 1
}

rm -rf "$DIR/repo"
mkdir -p "$DIR/repo"
tar -xf "$TARFILE" -C "$DIR/repo"
exec node "$DIR/repo/deploy/remote/deploy-stack.ts" "$@"
`;

  const remote = spawnSync(
    "ssh",
    sshArgs([
      // Remote args are single-quoted tokens for the remote shell; branch is
      // refused on quote characters above, slug/dirs/pid are validated sets.
      "bash",
      "-s",
      "--",
      `'${cfg.DEPLOY_STACK}'`,
      `'${stack}'`,
      `'${slug}'`,
      `'${branch}'`,
      `'${commitSha}'`,
      `'${commitTs}'`,
      `'${tarfile}'`,
      `'${secretTmp}'`,
    ]),
    { input: bootstrap, stdio: ["pipe", "inherit", "inherit"] }
  );
  if (remote.status !== 0) {
    process.exit(remote.status ?? 1);
  }

  // Frontend deploy: the backend landed first, from the same commit. The
  // Cloudflare adapter's build emits the deployable Worker config at
  // dist/server/wrangler.json (assets in dist/client).
  const isPreview = cfg.DEPLOY_STACK === "preview";
  const frontend = spawnSync(
    "npx",
    isPreview
      ? ["wrangler", "preview", "--config", "dist/server/wrangler.json"]
      : ["wrangler", "deploy", "--config", "dist/server/wrangler.json"],
    { cwd: REPO_ROOT, encoding: "utf8" }
  );
  process.stdout.write(frontend.stdout ?? "");
  process.stderr.write(frontend.stderr ?? "");
  if (frontend.status !== 0) {
    die("frontend deploy failed");
  }

  if (isPreview) {
    // Point the stack's ADMIN_URL (order-email deep links, ADR 0008) at this
    // preview's stable site URL, as reported by wrangler preview. It cannot
    // be known before the first preview deploy exists, so deploy-stack.ts
    // seeds the prod dashboard as a fallback and this overwrites it as soon
    // as the URL is real. Strict charset validation: the URL is embedded in
    // a remote shell command below.
    const previewUrl = /^https:\/\/[a-z0-9.-]+\/?$/i.exec(
      /Preview URL:\s*(\S+)/.exec(`${frontend.stdout ?? ""}\n${frontend.stderr ?? ""}`)?.at(1) ?? ""
    )?.[0];
    if (!previewUrl) {
      console.error(
        "warning: wrangler preview printed no Preview URL — ADMIN_URL keeps the prod dashboard fallback"
      );
    } else {
      const adminUrl = `${previewUrl.replace(/\/$/, "")}/dashboard`;
      const update = spawnSync(
        "ssh",
        sshArgs([
          "bash",
          "-c",
          `'sed -i "s|^ADMIN_URL=.*|ADMIN_URL=${adminUrl}|" ${dir}/.env` +
            ` && cd ${dir} && docker compose up -d vendure worker'`,
        ]),
        { stdio: "inherit" }
      );
      if (update.status !== 0) {
        console.error("warning: ADMIN_URL update on the box failed");
      }
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
