import { VendureEvent } from "@vendure/core";
import type { RequestContext } from "@vendure/core";

/** The poll found a GLS problem status on a parcel and notifies the owner. */
export class GlsParcelProblemEvent extends VendureEvent {
  constructor(
    readonly ctx: RequestContext,
    readonly orderId: string,
    readonly orderCode: string,
    readonly parcelNumber: string,
    readonly statusCode: string,
    readonly statusDescription: string
  ) {
    super();
  }
}
