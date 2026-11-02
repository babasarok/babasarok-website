import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import {
  Material,
  MaterialColor,
  MaterialColorTranslation,
  MaterialTranslation,
} from "./material.entity";
import {
  MaterialColorResolver,
  MaterialFieldResolver,
  MaterialResolver,
  materialSchema,
  ShopMaterialResolver,
  shopMaterialSchema,
} from "./material.resolver";
import { MaterialFacetSync } from "./material-facet-sync";
import { MaterialService } from "./material.service";

@VendurePlugin({
  imports: [PluginCommonModule],
  entities: [Material, MaterialTranslation, MaterialColor, MaterialColorTranslation],
  adminApiExtensions: {
    schema: materialSchema,
    resolvers: [MaterialResolver, MaterialFieldResolver, MaterialColorResolver],
  },
  shopApiExtensions: {
    schema: shopMaterialSchema,
    resolvers: [ShopMaterialResolver, MaterialFieldResolver, MaterialColorResolver],
  },
  providers: [MaterialFacetSync, MaterialService],
  dashboard: "../../dashboard/material/material.tsx",
})
export class MaterialPlugin {}
