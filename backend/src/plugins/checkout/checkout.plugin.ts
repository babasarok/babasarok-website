import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import { CheckoutReadinessProcess } from "./checkout-process";

/** Guards placing an order made through the native shop-API flow (ADR 0013 decision 5). */
@VendurePlugin({
  imports: [PluginCommonModule],
  configuration: (config) => {
    config.orderOptions.process.push(new CheckoutReadinessProcess());

    return config;
  },
})
export class CheckoutPlugin {}
