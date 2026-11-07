import { defineConfig } from "tinacms";
import { GlobalConfigCollection } from "./collections/global-config";
import { HeroCollection } from "./collections/hero";
import { ServiceCollection } from "./collections/service";
import { AboutCollection } from "./collections/about";
import { BlogSectionCollection } from "./collections/blog-section";
import { BlogCollection } from "./collections/blog";
import { ContactCollection } from "./collections/contact";
import { AdatvedelemCollection } from "./collections/adatvedelem";
import { CheckoutCollection } from "./collections/checkout";
import { TermsCollection } from "./collections/terms";

const branch =
  process.env.WORKERS_CI_BRANCH ||
  process.env.CF_PAGES_BRANCH ||
  process.env.GITHUB_HEAD_REF ||
  process.env.GITHUB_REF_NAME ||
  process.env.HEAD ||
  "main";

export default defineConfig({
  branch,

  // Get this from tina.io
  clientId: process.env.TINA_CMS_CLIENT_ID ?? null,
  // Get this from tina.io
  token: process.env.TINA_CMS_CLIENT_TOKEN ?? null,

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
      BlogSectionCollection,
      BlogCollection,
      CheckoutCollection,
      ContactCollection,
      AdatvedelemCollection,
      TermsCollection,
    ],
  },
});
