import { Controller, HttpCode, HttpStatus, Post, Query } from "@nestjs/common";
import { BarionService } from "./barion.service";

/**
 * Barion POSTs a state-change signal here (the paymentId rides the query
 * string and the body). The signal is only a pointer: validate minimally,
 * enqueue the re-query job, and acknowledge within the 15 s budget — the
 * financial decision happens in the job, on the re-queried PaymentState.
 */
@Controller("payments/barion")
export class BarionController {
  constructor(private readonly barionService: BarionService) {}

  @Post("callback")
  @HttpCode(HttpStatus.OK)
  async callback(@Query("paymentId") paymentId: string): Promise<string> {
    await this.barionService.acceptCallback(paymentId);

    return "ok";
  }
}
