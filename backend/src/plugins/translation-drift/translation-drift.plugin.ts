import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import { MaterialPlugin } from "../material/material.plugin";
import { ProductPlugin } from "../product/product.plugin";
import { TranslationDriftResolver, translationDriftSchema } from "./translation-drift.resolver";
import { SetTranslationService } from "./set-translation.service";
import { TranslationDriftDismissal } from "./translation-drift.entity";
import { TranslationDriftService } from "./translation-drift.service";
import { TranslationGapService } from "./translation-gap.service";

@VendurePlugin({
  imports: [PluginCommonModule, MaterialPlugin, ProductPlugin],
  entities: [TranslationDriftDismissal],
  adminApiExtensions: { schema: translationDriftSchema, resolvers: [TranslationDriftResolver] },
  providers: [TranslationGapService, TranslationDriftService, SetTranslationService],
  dashboard: "../../dashboard/translation-drift/translation-drift.tsx",
})
export class TranslationDriftPlugin {}
