import gql from "graphql-tag";
import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import {
  orderSetFieldsSdl,
  OrderLineSetStateResolver,
  OrderSetDiscountsResolver,
} from "./order-set-fields.resolver";
import { GroupParentGuardResolver } from "./group-parent-guard.resolver";
import { ShopProductGroupResolver } from "./product-set.resolver";
import { SetBasketService } from "./set-basket.service";

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
  providers: [SetBasketService],
  shopApiExtensions: {
    schema: gql`
      ${shopProductGroupSchema}
      ${orderSetFieldsSdl}
    `,
    resolvers: [ShopProductGroupResolver, OrderSetDiscountsResolver, OrderLineSetStateResolver],
  },
  adminApiExtensions: {
    resolvers: [GroupParentGuardResolver],
  },
})
export class ProductSetPlugin {}
