import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import { barionClientFor } from "./barion-config";
import { barionHandler } from "./barion.handler";
import { env } from "../../env";
import { BarionPayment } from "./barion-payment.entity";
import { BarionController } from "./barion.controller";
import { barionShopSchema, BarionResolver } from "./barion.resolver";
import { BARION_CLIENT, BARION_CONFIG, BarionService } from "./barion.service";

/**
 * Barion payment (ADR 0021 slice 1: full prepay): the shop-API intent starts
 * an Immediate gateway payment, the callback controller enqueues a re-query
 * job, and the job records the settled payment through the `barion` handler
 * with an admin request context.
 */
@VendurePlugin({
  imports: [PluginCommonModule],
  entities: [BarionPayment],
  providers: [
    BarionService,
    { provide: BARION_CLIENT, useFactory: () => barionClientFor(env.barion) },
    { provide: BARION_CONFIG, useValue: env.barion },
  ],
  shopApiExtensions: { schema: barionShopSchema, resolvers: [BarionResolver] },
  controllers: [BarionController],
  configuration: (config) => {
    config.paymentOptions.paymentMethodHandlers.push(barionHandler);
    return config;
  },
})
export class BarionPlugin {}
