import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import { ProductGroup } from "./product-group.entity";
import { ProductGroupResolver, productGroupSchema } from "./product-group.resolver";
import { ProductGroupService } from "./product-group.service";

/**
 * Product groups (ADR 0010 decision 6): discounted sets and related-items
 * groups. The set-discount promotion reads the discounted sets from here.
 */
@VendurePlugin({
  imports: [PluginCommonModule],
  entities: [ProductGroup],
  adminApiExtensions: {
    schema: productGroupSchema,
    resolvers: [ProductGroupResolver],
  },
  providers: [ProductGroupService],
  dashboard: "../../dashboard/product-group/product-group.tsx",
})
export class ProductGroupPlugin {}
