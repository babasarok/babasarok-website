import { OnApplicationBootstrap } from "@nestjs/common";
import { PluginCommonModule, VendurePlugin } from "@vendure/core";
import { CheckoutReadinessProcess } from "./checkout-process";
import { LineSummaryService } from "./line-summary";

/** Guards placing an order made through the native shop-API flow (ADR 0013 decision 5). */
@VendurePlugin({
  imports: [PluginCommonModule],
  providers: [LineSummaryService],
  dashboard: "../../dashboard/order-lines/order-lines.tsx",
  configuration: (appConfig) => {
    appConfig.orderOptions.process.push(new CheckoutReadinessProcess());

    return appConfig;
  },
})
export class CheckoutPlugin implements OnApplicationBootstrap {
  constructor(private lineSummaryService: LineSummaryService) {}

  onApplicationBootstrap(): void {
    this.lineSummaryService.onApplicationBootstrap();
  }
}
