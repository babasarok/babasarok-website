/**
 * Boots the backend for the dashboard e2e suite: playwright.dashboard.config.ts
 * runs this as its webServer and waits on http://localhost:4000/health. Every
 * run starts from a known state — the e2e database named in e2e.env is dropped
 * and re-created, migrations are applied, two materials are seeded, then the
 * Vendure server serves the admin API on the port from e2e.env. The worker
 * process boots after the server's health check: the product-definition sync
 * runs on the job queue, which only the worker drains.
 *
 * The script tears its children down with itself: they are signaled on
 * SIGTERM/SIGINT, on exit, and when the script notices its own parent is
 * gone (Playwright kills the pnpm wrapper the webServer command runs as,
 * and the signal does not necessarily reach this script) — otherwise the
 * server and worker survive holding the API port and the e2e database, and
 * the next run dies in the port-busy guard. The children deliberately stay
 * in the script's process group: pnpm's own teardown watchdog SIGKILLs that
 * whole group when the wrapper dies, and a group kill still reaches them
 * when this script is killed without running any of its own handlers.
 *
 * Run: pnpm -C backend run e2e:server
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";
import { Pool } from "pg";

const backendRoot = path.resolve(import.meta.dirname, "..");

interface SeedColor {
  id: string;
  label: string;
  hex: string;
}

interface SeedMaterial {
  slug: string;
  label: string;
  colors: SeedColor[];
}

// Fixed seed data the e2e assertions rely on; the create test adds a third
// material through the UI.
const SEED_MATERIALS: SeedMaterial[] = [
  {
    slug: "e2e-pamut",
    label: "Pamut",
    colors: [{ id: "feher", label: "Fehér", hex: "#f5f5f5" }],
  },
  { slug: "e2e-vaszon", label: "Vászon", colors: [] },
];

function resolveDatabase(): { dbUrl: string; dbName: string } | null {
  const dbUrl = process.env.DATABASE_URL;

  if (dbUrl === undefined) {
    console.error("DATABASE_URL is not set — run via pnpm -C backend run e2e:server");
    return null;
  }

  const dbName = new URL(dbUrl).pathname.slice(1);

  if (dbName === "") {
    console.error("DATABASE_URL has no database name");
    return null;
  }

  return { dbUrl, dbName };
}

async function recreateDatabase(maintenanceUrl: string, dbName: string): Promise<void> {
  const pool = new Pool({ connectionString: maintenanceUrl, max: 1 });

  try {
    await pool.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await pool.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await pool.end();
  }
}

async function seedMaterials(dbUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: dbUrl });

  try {
    for (const material of SEED_MATERIALS) {
      const inserted = await pool.query<{ id: number }>(
        "INSERT INTO material (slug, label) VALUES ($1, $2) RETURNING id",
        [material.slug, material.label]
      );
      const materialId = inserted.rows[0].id;

      for (const [position, color] of material.colors.entries()) {
        await pool.query(
          'INSERT INTO material_color ("colorId", label, hex, "materialId", position) VALUES ($1, $2, $3, $4, $5)',
          [color.id, color.label, color.hex, materialId, position]
        );
      }
    }
  } finally {
    await pool.end();
  }
}

const children: Array<ChildProcess> = [];

/** Signals the spawned server and worker. They deliberately share this
 * script's process group (never detached): a group kill — pnpm's teardown
 * watchdog, a terminal interrupt — must take them down even when this script
 * is killed without running any of its own handlers. */
function killChildren(): void {
  for (const child of children) {
    child.kill("SIGTERM");
  }
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    killChildren();
    process.exit(1);
  });
}

process.on("exit", () => {
  killChildren();
});

const parentPid = process.ppid;

setInterval(() => {
  if (process.ppid !== parentPid) {
    killChildren();
    process.exit(1);
  }
}, 500).unref();

async function isApiPortBusy(): Promise<boolean> {
  try {
    await fetch(`http://localhost:${process.env.PORT ?? "4000"}/health`);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const guard = resolveDatabase();

  if (guard === null) {
    process.exit(1);
  }

  if (await isApiPortBusy()) {
    console.error(
      `Something already serves the API port ${process.env.PORT ?? "4000"} (dev backend running?) — stop it before the e2e run.`
    );
    process.exit(1);
  }

  const maintenanceUrl = new URL(guard.dbUrl);
  maintenanceUrl.pathname = "/postgres";
  await recreateDatabase(maintenanceUrl.toString(), guard.dbName);

  const migrate = spawnSync(process.execPath, [path.join(backendRoot, "dist", "migrate.js")], {
    stdio: "inherit",
  });

  if (migrate.status !== 0) {
    process.exit(migrate.status ?? 1);
  }

  await seedMaterials(guard.dbUrl);

  const server = spawn(process.execPath, [path.join(backendRoot, "dist", "index.js")], {
    stdio: "inherit",
  });

  children.push(server);

  server.on("exit", (code) => {
    process.exit(code ?? 1);
  });

  await waitForServerHealth();

  // The server only enqueues product-definition syncs (the job queue); the
  // worker drains it, so the dashboard's pending→synced flow needs both
  // processes — the same server+worker pair dev and the deploy run.
  const worker = spawn(process.execPath, [path.join(backendRoot, "dist", "index-worker.js")], {
    stdio: "inherit",
  });

  children.push(worker);

  worker.on("exit", (code) => {
    process.exit(code ?? 1);
  });
}

/** Resolves once the server answers /health, so its bootstrap (channel setup
 * on a fresh database) is done before the worker bootstraps against the same
 * database. */
async function waitForServerHealth(): Promise<void> {
  const url = `http://localhost:${process.env.PORT ?? "4000"}/health`;

  for (let attempt = 0; attempt < 240; attempt += 1) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }
    } catch {
      // The server is not listening yet; the playwright webServer timeout
      // surfaces the failure if it never comes up.
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("A szerver nem jelentkezett be a /health végponton.");
}

try {
  await main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
