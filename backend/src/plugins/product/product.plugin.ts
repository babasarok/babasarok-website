import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import { ProductDefinition } from "./product.entity";
import {
  ProductDefinitionResolver,
  ProductFieldResolver,
  productDefinitionSchema,
  ShopProductFieldResolver,
  shopProductSchema,
} from "./product.resolver";
import { ShopThreadColorResolver } from "./thread-color.resolver";
import { ProductDefinitionService } from "./product-definition.service";
import { BulkVariantWriter } from "./bulk-variant-writer";

@VendurePlugin({
  imports: [PluginCommonModule],
  entities: [ProductDefinition],
  adminApiExtensions: {
    schema: productDefinitionSchema,
    resolvers: [ProductDefinitionResolver, ProductFieldResolver],
  },
  shopApiExtensions: {
    schema: shopProductSchema,
    resolvers: [ShopProductFieldResolver, ShopThreadColorResolver],
  },
  providers: [ProductDefinitionService, BulkVariantWriter],
  dashboard: "../../dashboard/product/product-definition.tsx",
})
export class ProductPlugin {}
