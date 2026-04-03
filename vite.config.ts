import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    plugins: [
        svelte(),
        tailwindcss({
            optimize: true,
        })
    ],

    publicDir: false,

    build: {
        outDir: "./static/components",
        emptyOutDir: true,

        lib: {
            entry: "./src/elements.ts",
            cssFileName: "elements",
            formats: ["es"],
            fileName: () => "elements.js",
        },
    },
});
