import type { AstroIntegration } from "astro";

/**
 * Serves the dashboard's vite dev server (started by `npm run dev`) at
 * /dashboard and the local admin API at /admin-api, so the dev dashboard is
 * same-origin with the site. Only affects `astro dev`.
 */
export function devProxy(): AstroIntegration {
  return {
    name: "babasarok-dev-proxy",
    hooks: {
      "astro:config:setup": ({ updateConfig }) => {
        updateConfig({
          vite: {
            server: {
              proxy: {
                "^/dashboard(/|$)": { target: "http://localhost:5173", ws: true },
                "/admin-api": "http://localhost:4000",
              },
            },
          },
        });
      },
    },
  };
}
