import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import { ConfiguredOrderLineInterceptor } from "./configured-line-interceptor";

/**
 * Server-side order pricing (ADR 0010 delivery step 5): the OrderItemPrice
 * calculation strategy prices configured lines from the canonical definitions,
 * and the interceptor rejects unpriceable lines with a clear error result.
 */
@VendurePlugin({
  imports: [PluginCommonModule],
  configuration: (config) => {
    config.orderOptions.orderInterceptors.push(new ConfiguredOrderLineInterceptor());

    return config;
  },
})
export class PricingPlugin {}
