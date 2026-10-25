import { existsSync } from "node:fs";
import { exec, spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import type { AstroIntegration } from "astro";

const log = (message: string): void => {
  console.log(`▶ [dev-stack] ${message}`);
};

const execp = (command: string): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    exec(command, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

const BACKEND_PORT = 4000;
const DASHBOARD_PORT = 5173;

/** Rejects with a fix-it message when the port is taken by a stale process. */
const assertPortFree = (name: string, port: number): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", (error) => {
      probe.close();
      if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") {
        reject(
          new Error(
            `${name} port ${port} is already in use — a dev stack is probably still running. Stop it first ("astro dev stop", or kill the stale backend/vite processes).`
          )
        );
        return;
      }
      reject(error);
    });
    probe.once("listening", () => probe.close(() => resolve()));
    probe.listen(port, "127.0.0.1");
  });

async function waitForPostgres(): Promise<void> {
  log("postgres");
  await execp("docker compose up -d postgres");
  for (let i = 0; i < 120; i++) {
    try {
      await execp("docker compose exec -T postgres pg_isready -U babasarok -d babasarok");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  log("postgres did not become ready within 60 seconds");
}

/** Non-blocking: the site starts immediately, the API announces itself. */
async function waitForApi(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch("http://localhost:4000/health");
      if (response.ok) {
        log("vendure api ready → http://localhost:4000 (dashboard: /dashboard)");
        return;
      }
    } catch {
      // Not up yet — the backend dev script compiles before it can listen.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  log("vendure api did not become healthy within 2 minutes");
}

/**
 * Dev-only: brings up postgres, the Vendure backend (server + worker,
 * watched) and the dashboard's vite dev server (HMR, proxied by
 * DashboardPlugin on :5173) alongside `astro dev`, and tears everything
 * down when the dev server stops. Never added outside `astro dev` — see
 * astro.config.ts.
 */
export function devStack(): AstroIntegration {
  let backend: ChildProcess | undefined;
  let dashboard: ChildProcess | undefined;

  // The detached children are their own process-group leaders: one
  // group-kill per child takes down pnpm, the tsc watcher and both node
  // watchers (dashboard: vite and its compiled vendure-config import).
  const stop = (): void => {
    for (const child of [dashboard, backend]) {
      if (child?.pid && !child.killed) {
        process.kill(-child.pid, "SIGTERM");
      }
    }
    backend = undefined;
    dashboard = undefined;
  };

  // Vite's SIGTERM listener (astro dev stop) closes the server, which fires
  // astro:server:done — the hook below already stops the children. Nothing
  // handles SIGINT (Ctrl+C), and signal death skips 'exit' handlers, so the
  // children would leak; handle it here.
  let wired = false;
  const wireShutdown = (): void => {
    if (wired) {
      return;
    }
    wired = true;
    process.on("SIGINT", () => {
      stop();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      stop();
      process.exit(0);
    });
    process.on("exit", stop);
  };

  return {
    name: "babasarok-dev-stack",
    hooks: {
      "astro:server:start": async () => {
        if (!existsSync("backend/.env")) {
          throw new Error(
            "backend/.env is missing — copy backend/.env.example and fill it in first."
          );
        }
        await assertPortFree("vendure", BACKEND_PORT);
        await assertPortFree("dashboard", DASHBOARD_PORT);

        await waitForPostgres();

        log("dashboard (vite dev server, HMR → http://localhost:4000/dashboard)");
        dashboard = spawn("pnpm", ["-C", "backend", "run", "dashboard"], {
          stdio: "inherit",
          detached: true,
        });
        dashboard.on("exit", (code) => {
          if (code !== 0 && code !== null) {
            log(`dashboard vite exited with code ${code}`);
          }
        });

        log("vendure backend (server + worker, watching)");
        backend = spawn("pnpm", ["-C", "backend", "run", "dev"], {
          stdio: "inherit",
          detached: true,
        });
        backend.on("exit", (code) => {
          if (code !== 0 && code !== null) {
            log(`vendure backend exited with code ${code}`);
          }
        });

        void waitForApi();
        wireShutdown();
      },
      "astro:server:done": stop,
    },
  };
}
