import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    plugins: [
        svelte(),
        tailwindcss({
            optimize: true,
        }),
    ],

    publicDir: false,

    build: {
        emptyOutDir: true,
        watch: {
            exclude: [
                "hugo_stats.json",
                "resources/**",
                "assets/**",
                "public/**",
                "layouts/**",
                "static/**",
                "content/**",
            ],
        },
        outDir: "./assets/components",

        lib: {
            entry: "./src/elements.ts",
            cssFileName: "elements",
            formats: ["es"],
            fileName: () => "elements.js",
        },
    },
});
