import { defineConfig } from "tinacms";
import { GlobalConfigCollection } from "./collections/global-config";

// Your hosting provider likely exposes this as an environment variable
const branch =
  process.env.GITHUB_BRANCH ||
  process.env.VERCEL_GIT_COMMIT_REF ||
  process.env.HEAD ||
  "main";

export default defineConfig({
  branch,

  // Get this from tina.io
  clientId: process.env.PUBLIC_TINA_CLIENT_ID,
  // Get this from tina.io
  token: process.env.TINA_TOKEN,

  build: {
    outputFolder: "admin",
    publicFolder: "public",
  },
  // Media lives in `src/assets` so Astro processes it (<Image>) instead of
  // serving it raw from `public`. With publicFolder="src" + mediaRoot="assets",
  // Tina uploads to `src/assets/...` and stores refs as `/assets/...`.
  media: {
    tina: {
      mediaRoot: "assets",
      publicFolder: "src",
    },
  },
  // See docs on content modeling for more info on how to setup new content models: https://tina.io/docs/schema/
  schema: {
    collections: [GlobalConfigCollection],
  },
});
