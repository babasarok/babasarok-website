import { defineConfig, type UserConfigFn } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

const conf: UserConfigFn = () => {
    const isWatch = process.argv.includes("--watch") || process.argv.includes("-w");
    return {
        plugins: [
            svelte(),
            tailwindcss({
                optimize: true,
            }),
        ],

        publicDir: false,

        build: {
            emptyOutDir: true,
            watch: isWatch
                ? {
                      exclude: [
                          "hugo_stats.json",
                          "resources/**",
                          "assets/**",
                          "public/**",
                          "layouts/**",
                          "static/**",
                          "content/**",
                      ],
                  }
                : null,

            outDir: "./assets/components",

            lib: {
                entry: "./src/elements.ts",
                cssFileName: "elements",
                formats: ["es"],
                fileName: () => "elements.js",
            },
        },
    };
};

export default defineConfig(conf);
