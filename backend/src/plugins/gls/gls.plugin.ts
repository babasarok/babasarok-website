import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import { env } from "../../env";
import { glsClientFor } from "./gls-config";
import { glsFulfillmentHandler } from "./gls-fulfillment-handler";
import { GlsParcel } from "./gls-parcel.entity";
import { glsAdminSchema, GlsResolver } from "./gls.resolver";
import { GLS_CLIENT, GLS_MODE, GlsService } from "./gls.service";

@VendurePlugin({
  imports: [PluginCommonModule],
  entities: [GlsParcel],
  providers: [
    GlsService,
    { provide: GLS_CLIENT, useFactory: () => glsClientFor(env.gls) },
    { provide: GLS_MODE, useValue: env.gls.mode },
  ],
  adminApiExtensions: { schema: glsAdminSchema, resolvers: [GlsResolver] },
  configuration: (config) => {
    config.shippingOptions.fulfillmentHandlers.push(glsFulfillmentHandler);
    return config;
  },
})
export class GlsPlugin {}
