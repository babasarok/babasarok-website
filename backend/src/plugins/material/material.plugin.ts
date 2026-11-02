import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import { Material, MaterialColor } from "./material.entity";
import { MaterialColorResolver, MaterialResolver, materialSchema } from "./material.resolver";
import { MaterialFacetSync } from "./material-facet-sync";
import { MaterialService } from "./material.service";

@VendurePlugin({
  imports: [PluginCommonModule],
  entities: [Material, MaterialColor],
  adminApiExtensions: {
    schema: materialSchema,
    resolvers: [MaterialResolver, MaterialColorResolver],
  },
  providers: [MaterialFacetSync, MaterialService],
  dashboard: "../../dashboard/material/material.tsx",
})
export class MaterialPlugin {}
