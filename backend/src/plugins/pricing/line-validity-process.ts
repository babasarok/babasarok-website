import type { Injector, OrderProcess, OrderTransitionData } from "@vendure/core";
import { isLegacyQuoteOrder } from "../../shared/legacy-order";
import { encodeRefusal } from "../../shared/refusal";
import { LineInvalidReasonService } from "./line-invalid-reason.service";

/**
 * Refuses to leave AddingItems while a line can no longer be ordered as
 * configured; removing or adjusting the line clears it.
 */
export class LineValidityProcess implements OrderProcess<string> {
  private reasons!: LineInvalidReasonService;

  init(injector: Injector): void {
    this.reasons = injector.get(LineInvalidReasonService);
  }

  async onTransitionStart(
    fromState: string,
    toState: string,
    { ctx, order }: OrderTransitionData
  ): Promise<string | undefined> {
    if (fromState !== "AddingItems" || toState !== "ArrangingPayment") {
      return undefined;
    }

    if (isLegacyQuoteOrder(order)) {
      return undefined;
    }

    const reason = await this.reasons.firstReasonForOrder(ctx, order.id);

    return reason === undefined ? undefined : encodeRefusal(reason);
  }
}
