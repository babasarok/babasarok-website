import { defineConfig } from "tinacms";
import { GlobalConfigCollection } from "./collections/global-config";
import { HeroCollection } from "./collections/hero";
import { ServiceCollection } from "./collections/service";
import { AboutCollection } from "./collections/about";
import { ProductSectionCollection } from "./collections/product-section";
import { BlogSectionCollection } from "./collections/blog-section";
import { BlogCollection } from "./collections/blog";
import { ProductCollection } from "./collections/product";
import { MaterialCollection } from "./collections/material";
import { DeliveryMethodCollection } from "./collections/delivery-method";
import { ContactCollection } from "./collections/contact";

// Your hosting provider likely exposes this as an environment variable
const branch =
  process.env.GITHUB_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || process.env.HEAD || "main";

export default defineConfig({
  branch,

  // Get this from tina.io
  clientId: process.env.PUBLIC_TINA_CLIENT_ID ?? null,
  // Get this from tina.io
  token: process.env.TINA_TOKEN ?? null,

  build: {
    outputFolder: "admin",
    publicFolder: "public",
  },
  media: {
    tina: {
      mediaRoot: "src/assets",
      publicFolder: "",
    },
  },
  // See docs on content modeling for more info on how to setup new content models: https://tina.io/docs/schema/
  schema: {
    collections: [
      GlobalConfigCollection,
      HeroCollection,
      ServiceCollection,
      AboutCollection,
      ProductSectionCollection,
      BlogSectionCollection,
      BlogCollection,
      ProductCollection,
      MaterialCollection,
      DeliveryMethodCollection,
      ContactCollection,
    ],
  },
});
