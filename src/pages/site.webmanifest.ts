import type { APIRoute } from "astro";
import android192 from "../assets/favicons/android-chrome-192x192.png?url";
import android512 from "../assets/favicons/android-chrome-512x512.png?url";

export const prerender = true;

export const GET: APIRoute = () => {
  const manifest = {
    name: "Babasarok",
    short_name: "Babasarok",
    icons: [
      { src: android192, sizes: "192x192", type: "image/png" },
      { src: android512, sizes: "512x512", type: "image/png" },
    ],
    theme_color: "#ffffff",
    background_color: "#ffffff",
    display: "standalone",
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json" },
  });
};
