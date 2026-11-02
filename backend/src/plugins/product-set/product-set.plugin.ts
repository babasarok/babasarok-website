import gql from "graphql-tag";
import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import { ShopProductGroupResolver } from "./product-set.resolver";

const shopProductGroupSchema = gql`
  enum ProductGroupKind {
    set
    related
  }

  type ProductGroup {
    id: String!
    kind: ProductGroupKind!
    label: String!
    discount: Int
    productIds: [String!]!
  }

  extend type Query {
    productGroups: [ProductGroup!]!
  }
`;

@VendurePlugin({
  imports: [PluginCommonModule],
  shopApiExtensions: {
    schema: shopProductGroupSchema,
    resolvers: [ShopProductGroupResolver],
  },
})
export class ProductSetPlugin {}
