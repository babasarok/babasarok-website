import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import gql from "graphql-tag";
import { orderLifecycleSchema, OrderLifecycleResolver } from "./order-lifecycle.resolver";
import { OrderLifecycleService } from "./order-lifecycle.service";

/**
 * The deposit's manual recording and the fulfillment-start flag (ADR 0021
 * §4): the owner's dashboard path into the deposit branch — the same apply
 * the IPN receiver automates in slice 4.
 */
@VendurePlugin({
  imports: [PluginCommonModule],
  adminApiExtensions: { schema: gql(orderLifecycleSchema), resolvers: [OrderLifecycleResolver] },
  providers: [OrderLifecycleService],
  dashboard: "../../dashboard/order-lifecycle/order-lifecycle.tsx",
})
export class OrderLifecyclePlugin {}
