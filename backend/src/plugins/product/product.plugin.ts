import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import { ProductDefinition } from "./product.entity";
import {
  ProductDefinitionResolver,
  ProductFieldResolver,
  productDefinitionSchema,
} from "./product.resolver";
import { ProductDefinitionService } from "./product-definition.service";

@VendurePlugin({
  imports: [PluginCommonModule],
  entities: [ProductDefinition],
  adminApiExtensions: {
    schema: productDefinitionSchema,
    resolvers: [ProductDefinitionResolver, ProductFieldResolver],
  },
  providers: [ProductDefinitionService],
  dashboard: "../../dashboard/product/product-definition.tsx",
})
export class ProductPlugin {}
