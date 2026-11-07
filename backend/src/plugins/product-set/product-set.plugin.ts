import gql from "graphql-tag";
import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import { APP_INTERCEPTOR } from "@nestjs/core";
import {
  orderSetFieldsSdl,
  OrderLineSetStateResolver,
  OrderSetDiscountsResolver,
} from "./order-set-fields.resolver";
import { GroupParentGuardInterceptor } from "./group-parent-guard.interceptor";
import { ShopProductGroupResolver } from "./product-set.resolver";
import { SetBasketService } from "./set-basket.service";
import { SetPromotionGuardInterceptor } from "./set-promotion-guard.interceptor";

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
  providers: [
    SetBasketService,
    { provide: APP_INTERCEPTOR, useClass: GroupParentGuardInterceptor },
    { provide: APP_INTERCEPTOR, useClass: SetPromotionGuardInterceptor },
  ],
  shopApiExtensions: {
    schema: gql`
      ${shopProductGroupSchema}
      ${orderSetFieldsSdl}
    `,
    resolvers: [ShopProductGroupResolver, OrderSetDiscountsResolver, OrderLineSetStateResolver],
  },
})
export class ProductSetPlugin {}
