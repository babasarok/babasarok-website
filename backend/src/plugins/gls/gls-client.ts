export interface GlsAddress {
  name: string;
  street: string;
  houseNumber?: string;
  houseNumberInfo?: string;
  city: string;
  zipCode: string;
  countryCode: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
}

export interface GlsCashOnDelivery {
  amount: number;
  reference: string;
  currency: string;
}

export interface GlsParcelRequest {
  clientReference: string;
  content: string;
  pickupAddress: GlsAddress;
  deliveryAddress: GlsAddress;
  cashOnDelivery?: GlsCashOnDelivery;
}

export interface GlsLabel {
  parcelId: number;
  parcelNumber: number;
  pdf: Uint8Array;
}

export interface GlsErrorInfo {
  code: number;
  description: string;
}

export type GlsFailure =
  { kind: "rejected"; errors: GlsErrorInfo[] } | { kind: "unreachable"; reason: string };

export class GlsError extends Error {
  constructor(
    readonly operation: "createLabel" | "deleteLabel",
    readonly failure: GlsFailure
  ) {
    super(glsErrorMessage(operation, failure));
    this.name = "GlsError";
  }
}

function glsErrorMessage(operation: GlsError["operation"], failure: GlsFailure): string {
  if (failure.kind === "rejected") {
    const details = failure.errors.map((e) => `${e.code}: ${e.description}`).join("; ");
    return `GLS rejected ${operation} (${details})`;
  }

  if (operation === "createLabel") {
    return `GLS did not answer createLabel (${failure.reason}); the parcel may still have been created — check MyGLS before trying again`;
  }

  return `GLS did not answer ${operation} (${failure.reason})`;
}

/**
 * GLS creates a new parcel on every `createLabel` call, even for a repeated
 * `clientReference`, and hands out the label PDF only in that call's result.
 */
export interface GlsClient {
  createLabel(parcel: GlsParcelRequest): Promise<GlsLabel>;
  deleteLabel(parcelId: number): Promise<void>;
}
