import { existsSync } from "node:fs";
import { exec, spawn, type ChildProcess } from "node:child_process";
import type { AstroIntegration } from "astro";

const log = (message: string) => console.log(`▶ [dev-stack] ${message}`);

const execp = (command: string) =>
  new Promise<void>((resolve, reject) =>
    exec(command, error => (error ? reject(error) : resolve())),
  );

async function waitForPostgres(): Promise<void> {
  log("postgres");
  await execp("docker compose up -d postgres");
  while (true) {
    try {
      await execp("docker compose exec -T postgres pg_isready -U babasarok -d babasarok");
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

/** Non-blocking: the site starts immediately, the API announces itself. */
async function waitForApi(): Promise<void> {
  for (let i = 0; i < 120; i++) {
    try {
      const response = await fetch("http://localhost:4000/health");
      if (response.ok) {
        log("vendure api ready → http://localhost:4000 (admin ui: /admin-ui)");
        return;
      }
    } catch {
      // Not up yet — the backend dev script compiles before it can listen.
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  log("vendure api did not become healthy within 2 minutes");
}

/**
 * Dev-only: brings up postgres and the Vendure backend (server + worker,
 * watched) alongside `astro dev`, and tears the backend down when the dev
 * server stops. Never added outside `astro dev` — see astro.config.ts.
 */
export function devStack(): AstroIntegration {
  let backend: ChildProcess | undefined;

  // The detached backend is its own process-group leader: one group-kill
  // takes down pnpm, the tsc watcher and both node watchers.
  const stop = () => {
    if (backend?.pid && !backend.killed) {
      process.kill(-backend.pid, "SIGTERM");
    }
    backend = undefined;
  };

  return {
    name: "babasarok-dev-stack",
    hooks: {
      "astro:server:start": async () => {
        if (!existsSync("backend/.env")) {
          throw new Error("backend/.env is missing — copy backend/.env.example and fill it in first.");
        }

        await waitForPostgres();

        log("vendure backend (server + worker, watching)");
        backend = spawn("pnpm", ["-C", "backend", "run", "dev"], {
          stdio: "inherit",
          detached: true,
        });
        backend.on("exit", code => {
          if (code !== 0 && code !== null) {
            log(`vendure backend exited with code ${code}`);
          }
        });

        void waitForApi();
        // astro:server:done may not fire on every shutdown path (e.g. a
        // SIGINT handled only by process exit); 'exit' covers those.
        process.on("exit", stop);
      },
      "astro:server:done": stop,
    },
  };
}
