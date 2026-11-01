/**
 * The mutating half of a backend deploy, executed on the Hetzner box by the
 * shell bootstrap that shipped it inside the repo tar (scripts/deploy-backend.ts).
 * Runs with the two flock's already held (box-wide infra lock, per-stack
 * deploy lock) and receives the validated deploy arguments as argv:
 *
 *   $1 DEPLOY_STACK (prod|preview)   $5 COMMIT_SHA
 *   $2 STACK (prod or slug)          $6 COMMIT_TS (committer, unix)
 *   $3 SLUG ("" for prod)            $7 incoming tar path (deleted here)
 *   $4 BRANCH ("" for prod)          $8 secret-tmp path ("" for preview)
 *
 * Committer timestamps order deploys: a build of an older commit exits
 * nonzero, which stops the caller's wrangler step — a late, stale build can
 * never roll a stack back. Roll back by pushing a fresh commit.
 *
 * Stdlib only: the box has plain apt Node, no node_modules anywhere.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
if (args.length < 7) {
  throw new Error("usage: deploy-stack.ts <stack> <slug> <branch> <sha> <ts> <tar> <secret-tmp>");
}

const [deployStack, stack, slug, branch, commitSha, commitTs, tarfile, secretTmp = ""] = args;

const ROOT = "/srv/babasarok";
const INFRA = `${ROOT}/infra`;
const DIR = `${ROOT}/${stack}`;
const isPreview = deployStack === "preview";
const DB = `babasarok_preview_${slug}`;

function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; input?: string | Buffer; stream?: boolean } = {}
): string {
  // stream: inherit stdio so long-running output (image builds) flows to the
  // CF build log live instead of surfacing only on completion.
  if (opts.stream) {
    const s = spawnSync(cmd, args, { cwd: opts.cwd, stdio: "inherit" });
    if (s.status !== 0) {
      throw new Error(`${cmd} ${args.join(" ")} failed (exit ${s.status})`);
    }
    return "";
  }

  const r = spawnSync(cmd, args, { cwd: opts.cwd, input: opts.input, encoding: "utf8" });
  if (r.status !== 0) {
    const stderr = r.stderr ? r.stderr.trim() : "";
    throw new Error(`${cmd} ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
  }
  return r.stdout;
}

/** docker exec ... psql -c against a container's postgres. */
function psql(container: string, db: string, sql: string): string {
  return run("docker", ["exec", container, "psql", "-U", "babasarok", "-d", db, "-c", sql]);
}

function compose(args: string[], cwd: string = DIR, stream = false): string {
  return run("docker", ["compose", ...args], { cwd, stream });
}

try {
  // commit.txt is written only after the health gate passes, so a failed
  // deploy never records itself.
  const commitFile = `${DIR}/commit.txt`;
  if (existsSync(commitFile)) {
    const [deployedTs, deployedSha] = readFileSync(commitFile, "utf8").trim().split(" ");
    if (Number(commitTs) < Number(deployedTs)) {
      throw new Error(
        `commit ${commitSha} is older than deployed ${deployedSha}; refusing to roll back ${stack}`
      );
    }
  }

  rmSync(`${DIR}/repo`, { recursive: true, force: true });
  mkdirSync(`${DIR}/repo`, { recursive: true });
  run("tar", ["-xf", tarfile, "-C", `${DIR}/repo`]);
  rmSync(tarfile, { force: true });
  // Previews get their project name pinned in the file (prod's compose has
  // its own `name:`), so every compose command in this dir targets the stack.
  const composeYaml = readFileSync(`${DIR}/repo/deploy/${deployStack}/docker-compose.yml`, "utf8");
  writeFileSync(
    `${DIR}/docker-compose.yml`,
    isPreview ? `name: babasarok-${slug}\n${composeYaml}` : composeYaml
  );

  if (isPreview) {
    // The .env is provisioned once on first deploy and kept on later deploys;
    // the password must match the shared preview postgres in the infra stack
    // (every preview's DB lives inside that instance). Seed values come from
    // the prod stack's .env.
    if (!existsSync(`${DIR}/.env`)) {
      const envValue = (file: string, key: string): string =>
        readFileSync(file, "utf8")
          .split("\n")
          .find((l) => l.startsWith(`${key}=`))
          ?.slice(key.length + 1) ?? "";

      const secret = Array.from(
        { length: 64 },
        () => "0123456789abcdef"[Math.floor(Math.random() * 16)]
      ).join("");

      writeFileSync(
        `${DIR}/.env`,
        [
          `POSTGRES_PASSWORD=${envValue(`${INFRA}/.env`, "POSTGRES_PASSWORD")}`,
          `TOKEN_SECRET=${secret}`,
          `PREVIEW_SLUG=${slug}`,
          `PREVIEW_DB_NAME=${DB}`,
          `SHOP_OWNER_EMAIL=${envValue(`${ROOT}/prod/.env`, "SHOP_OWNER_EMAIL")}`,
          `ORDER_EMAIL_FROM=${envValue(`${ROOT}/prod/.env`, "ORDER_EMAIL_FROM")}`,
          `API_ALLOWED_ORIGINS=${envValue(`${ROOT}/prod/.env`, "API_ALLOWED_ORIGINS")}`,
          // Fallback until deploy-backend.ts registers the preview site URL
          // (printed by wrangler preview) right after the frontend deploy;
          // the URL does not exist before the first preview deploy.
          `ADMIN_URL=https://babasarok.net/dashboard`,
          "",
        ].join("\n")
      );
      chmodSync(`${DIR}/.env`, 0o600);
    }

    // Record the branch for the teardown cron (it checks whether the branch
    // still exists on origin).
    writeFileSync(`${DIR}/branch.txt`, `${branch}\n`);

    // The preview DB is disposable by design: dropped and re-copied from prod
    // on EVERY deploy, so branch migrations always run against fresh prod
    // data. WITH (FORCE) evicts open connections first (PostgreSQL 13+).
    psql("babasarok-edge-postgres-1", "postgres", `DROP DATABASE IF EXISTS "${DB}" WITH (FORCE)`);
    psql("babasarok-edge-postgres-1", "postgres", `CREATE DATABASE "${DB}"`);
    const dump = run("docker", [
      "exec",
      "babasarok-prod-postgres-1",
      "pg_dump",
      "-U",
      "babasarok",
      "-d",
      "babasarok",
    ]);
    run(
      "docker",
      [
        "exec",
        "-i",
        "babasarok-edge-postgres-1",
        "psql",
        "-U",
        "babasarok",
        "-d",
        DB,
        "-v",
        "ON_ERROR_STOP=1",
        "-q",
      ],
      { input: dump }
    );

    // Preview containers ride the INFRA stack's network; make sure the shared
    // preview postgres there is up before anything in this stack boots. The
    // infra compose file is refreshed first so a first-ever deploy of a new
    // postgres service definition still lands.
    copyFileSync(`${DIR}/repo/deploy/infra/docker-compose.yml`, `${INFRA}/docker-compose.yml`);
    compose(["up", "-d", "--wait", "postgres"], INFRA);
  } else {
    // For the infra networks-override generation (below): a stack's compose
    // network name. Previews ride the infra network and must NOT be listed —
    // they mark themselves with branch.txt instead.
    writeFileSync(`${DIR}/network`, `babasarok-${stack}_default\n`);
    if (secretTmp && existsSync(secretTmp)) {
      rmSync(`${DIR}/.env.cloudflare`, { force: true });
      copyFileSync(secretTmp, `${DIR}/.env.cloudflare`);
      chmodSync(`${DIR}/.env.cloudflare`, 0o600);
    }
  }

  // Bring the stack up; --wait blocks until the vendure healthcheck is green,
  // which is the gate before the frontend is allowed to deploy. Before up,
  // tag the currently-running image as previous; if the new stack fails to
  // come healthy (bad migration, crashloop), roll the containers back to
  // that image so prod keeps serving instead of 502-ing until the next push.
  // First remove renamed leftovers of a deploy killed mid-recreate: compose
  // renames the old container to <hash>_<name> during recreate, and an
  // orphan with that deterministic name makes the next recreate conflict and
  // --wait time out.
  for (const name of compose(["ps", "-a", "--format", "{{.Names}}"]).split("\n")) {
    if (/^[0-9a-f]{12}_/.test(name)) {
      run("docker", ["rm", "-f", name.trim()]);
    }
  }
  if (isPreview) {
    compose(["up", "-d", "--build", "--wait", "--wait-timeout", "300"], DIR, true);
  } else {
    const oldId = compose(["ps", "-q", "vendure"]).trim();
    if (oldId) {
      try {
        const image = run("docker", ["inspect", "-f", "{{.Image}}", oldId]).trim();
        if (image) {
          run("docker", ["tag", image, "babasarok-prod:previous"]);
        }
      } catch {
        // no running container to tag — first deploy or already down
      }
    }

    try {
      compose(["up", "-d", "--build", "--wait", "--wait-timeout", "300"], DIR, true);
    } catch {
      console.error("new stack failed to become healthy; rolling back to the previous image");
      if (existsSync(`${DIR}/docker-compose.rollback.yml`)) {
        rmSync(`${DIR}/docker-compose.rollback.yml`);
      }
      if (spawnSync("docker", ["image", "inspect", "babasarok-prod:previous"]).status === 0) {
        compose(["down"]);
        writeFileSync(
          `${DIR}/docker-compose.rollback.yml`,
          readFileSync(`${DIR}/docker-compose.yml`, "utf8").replace(
            "build: ./repo",
            "image: babasarok-prod:previous"
          )
        );
        compose(
          ["-f", "docker-compose.rollback.yml", "up", "-d", "--wait", "--wait-timeout", "300"],
          DIR,
          true
        );
        console.error("rolled back to the previous image; fix the commit and redeploy");
      } else {
        console.error("no previous image tagged; the stack stays down");
      }
      throw new Error("new stack failed to become healthy; rolled back (or stayed down)");
    }
  }

  // The deploy restarted the worker; any job it had mid-flight is stuck in
  // RUNNING forever (the queue never re-picks those). Requeue them. Previews
  // have no postgres service of their own — the branch DB lives in the
  // shared infra postgres.
  const requeue = "update job_record set state='PENDING', attempts=0 where state='RUNNING';";
  if (isPreview) {
    psql("babasarok-edge-postgres-1", DB, requeue);
  } else {
    compose([
      "exec",
      "-T",
      "postgres",
      "psql",
      "-U",
      "babasarok",
      "-d",
      "babasarok",
      "-c",
      requeue,
    ]);
  }

  // Shared edge Caddy: refresh the deployed compose + Caddyfile, then
  //   networks override — one entry per fixed stack's own compose network
  //   (previews ride the infra network and add no entry), generated here so a
  //   not-yet-deployed stack never breaks the edge. A stack's exact network
  //   name is recorded in its `network` file; dirs predating that marker fall
  //   back to the default compose name.
  //   preview routes — one caddy snippet per preview stack; stale ones are
  //   dropped when the stack dir is gone.
  //   teardown cron — removes preview stacks whose branch no longer exists.
  // The preview glob inside the Caddyfile matches no files until the first
  // preview deploys, which Caddy treats as a no-op.
  mkdirSync(`${INFRA}/previews`, { recursive: true });
  for (const f of [
    "docker-compose.yml",
    "Caddyfile",
    "preview-teardown.ts",
    "gen-networks-override.ts",
  ]) {
    copyFileSync(`${DIR}/repo/deploy/infra/${f}`, `${INFRA}/${f}`);
  }
  for (const f of ["preview-teardown.ts", "gen-networks-override.ts"]) {
    chmodSync(`${INFRA}/${f}`, 0o755);
  }
  for (const f of ["preview-teardown.sh", "gen-networks-override.sh"]) {
    rmSync(`${INFRA}/${f}`, { force: true });
  }
  run(`${INFRA}/gen-networks-override.ts`, [], { cwd: INFRA });
  if (existsSync(`${INFRA}/docker-compose.networks.yml`)) {
    compose(["-f", "docker-compose.yml", "-f", "docker-compose.networks.yml", "up", "-d"], INFRA);
  } else {
    compose(["up", "-d"], INFRA);
  }
  for (const f of readdirSync(`${INFRA}/previews`)) {
    if (!f.endsWith(".caddy")) {
      continue;
    }
    if (!existsSync(`${ROOT}/${f.slice(0, -".caddy".length)}`)) {
      rmSync(path.join(`${INFRA}/previews`, f));
    }
  }
  if (slug) {
    writeFileSync(
      `${INFRA}/previews/${slug}.caddy`,
      `api-${slug}.babasarok.net {\n\treverse_proxy vendure-${slug}:4000\n}\n`
    );
  }
  compose(
    ["exec", "-T", "caddy", "caddy", "reload", "--config", "/etc/caddy/Caddyfile", "--force"],
    INFRA
  );

  // Preview teardown cron: idempotent install, runs hourly. Same cron line
  // also prunes crash leftovers: incoming tarballs and secret-tmp files a
  // killed CF build leaves behind (this script's cleanup only runs if the
  // SSH session itself got here — a killed build can skip it).
  const oldCrontab = run("bash", ["-c", "crontab -l 2>/dev/null || true"]).split("\n");
  const kept = oldCrontab.filter(
    (l) => !l.includes("preview-teardown") && !l.includes("incoming-")
  );
  const cronLine =
    "17 * * * * /srv/babasarok/infra/preview-teardown.ts >> /srv/babasarok/infra/preview-teardown.log 2>&1; find /srv/babasarok -name 'incoming-*.tar' -mmin +120 -delete; find /srv/babasarok -name '.env.cloudflare-*.tmp' -mmin +120 -delete";
  writeFileSync(`${INFRA}/.crontab.new`, [...kept, cronLine, ""].join("\n"));
  execFileSync("crontab", [`${INFRA}/.crontab.new`]);
  rmSync(`${INFRA}/.crontab.new`);

  writeFileSync(commitFile, `${commitTs} ${commitSha}\n`);
  console.log(`backend ${stack} deployed and healthy (commit ${commitSha})`);
} finally {
  if (existsSync(tarfile)) {
    rmSync(tarfile, { force: true });
  }
  if (secretTmp && existsSync(secretTmp)) {
    rmSync(secretTmp, { force: true });
  }
}
