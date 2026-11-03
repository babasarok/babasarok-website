import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import { ConfiguredOrderLineInterceptor } from "./configured-line-interceptor";
import { LineInvalidReasonService } from "./line-invalid-reason.service";
import { LineValidityProcess } from "./line-validity-process";
import {
  lineInvalidReasonSchema,
  OrderLineInvalidReasonResolver,
} from "./order-line-invalid-reason.resolver";

/**
 * Server-side order pricing (ADR 0010 delivery step 5): the OrderItemPrice
 * calculation strategy prices configured lines from the canonical definitions,
 * the interceptor rejects unpriceable lines with a clear error result, and
 * stale lines are reported per line (`OrderLine.invalidReason`) and refused at
 * the transition (ADR 0013 decision 6).
 */
@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [LineInvalidReasonService],
  shopApiExtensions: {
    schema: lineInvalidReasonSchema,
    resolvers: [OrderLineInvalidReasonResolver],
  },
  configuration: (config) => {
    config.orderOptions.orderInterceptors.push(new ConfiguredOrderLineInterceptor());
    config.orderOptions.process.push(new LineValidityProcess());

    return config;
  },
})
export class PricingPlugin {}
