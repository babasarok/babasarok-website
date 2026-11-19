import { createHash } from "node:crypto";
import { z } from "zod";
import {
  GlsError,
  type GlsAddress,
  type GlsClient,
  type GlsErrorInfo,
  type GlsLabel,
  type GlsParcelRequest,
} from "./gls-client";

export type MyGlsEnvironment = "live" | "test";

export type MyGlsCountry = "HU";

export const LABEL_FORMATS = ["A4_2x2", "A4_4x1", "Thermo"] as const;

export type LabelFormat = (typeof LABEL_FORMATS)[number];

export interface MyGlsCredentials {
  username: string;
  password: string;
  clientNumber: number;
}

export interface MyGlsClientOptions {
  environment: MyGlsEnvironment;
  country: MyGlsCountry;
  credentials: MyGlsCredentials;
  labelFormat: LabelFormat;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const WEBSHOP_ENGINE = "Vendure";

const DEFAULT_TIMEOUT_MS = 30_000;

const ErrorInfoSchema = z.object({
  ErrorCode: z.number().int(),
  ErrorDescription: z.string().nullable(),
});

const ErrorListSchema = z
  .array(ErrorInfoSchema)
  .nullish()
  .transform((list) => list ?? []);

const PrintLabelsResponseSchema = z.object({
  Labels: z.array(z.number().int().min(0).max(255)).nullable(),
  PrintLabelsErrorList: ErrorListSchema,
  PrintLabelsInfoList: z
    .array(
      z.object({
        ClientReference: z.string().nullable(),
        ParcelId: z.number().int(),
        ParcelNumber: z.number().int(),
      })
    )
    .nullish()
    .transform((list) => list ?? []),
});

const DeleteLabelsResponseSchema = z.object({
  DeleteLabelsErrorList: ErrorListSchema,
  SuccessfullyDeletedList: z
    .array(z.object({ ParcelId: z.number().int() }))
    .nullish()
    .transform((list) => list ?? []),
});

const PDF_MAGIC = new TextEncoder().encode("%PDF-");

export function myGlsBaseUrl(environment: MyGlsEnvironment, country: MyGlsCountry): string {
  const host = environment === "test" ? "api.test.mygls" : "api.mygls";
  return `https://${host}.${country.toLowerCase()}/ParcelService.svc/json/`;
}

export function passwordDigest(password: string): number[] {
  return Array.from(createHash("sha512").update(password, "utf8").digest());
}

export function createMyGlsClient(options: MyGlsClientOptions): GlsClient {
  const baseUrl = myGlsBaseUrl(options.environment, options.country);
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const auth = {
    Username: options.credentials.username,
    Password: passwordDigest(options.credentials.password),
  };

  async function post<S extends z.ZodType>(
    operation: GlsError["operation"],
    method: string,
    body: Record<string, unknown>,
    schema: S
  ): Promise<z.output<S>> {
    let response: Response;

    try {
      response = await doFetch(baseUrl + method, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...auth, ...body }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new GlsError(operation, { kind: "unreachable", reason: errorText(error) });
    }

    if (!response.ok) {
      throw new GlsError(operation, { kind: "unreachable", reason: `HTTP ${response.status}` });
    }

    let json: unknown;

    try {
      json = await response.json();
    } catch (error) {
      throw new GlsError(operation, { kind: "unreachable", reason: errorText(error) });
    }

    const parsed = schema.safeParse(json);

    if (!parsed.success) {
      throw new GlsError(operation, {
        kind: "unreachable",
        reason: `unexpected ${method} response: ${parsed.error.message}`,
      });
    }

    return parsed.data;
  }

  return {
    async createLabel(parcel: GlsParcelRequest): Promise<GlsLabel> {
      const response = await post(
        "createLabel",
        "PrintLabels",
        {
          ParcelList: [wireParcel(parcel, options.credentials.clientNumber)],
          TypeOfPrinter: options.labelFormat,
          PrintPosition: 1,
          ShowPrintDialog: false,
          WebshopEngine: WEBSHOP_ENGINE,
        },
        PrintLabelsResponseSchema
      );

      if (response.PrintLabelsErrorList.length > 0) {
        throw new GlsError("createLabel", {
          kind: "rejected",
          errors: response.PrintLabelsErrorList.map(errorInfo),
        });
      }

      const infos = response.PrintLabelsInfoList;

      if (infos.length !== 1) {
        throw new GlsError("createLabel", {
          kind: "unreachable",
          reason: `expected one parcel, got ${infos.length}`,
        });
      }

      const info = infos[0];

      const pdf = Uint8Array.from(response.Labels ?? []);

      if (!isPdf(pdf)) {
        throw new GlsError("createLabel", {
          kind: "unreachable",
          reason: `parcel ${info.ParcelNumber} was created but no PDF label came back`,
        });
      }

      return { parcelId: info.ParcelId, parcelNumber: info.ParcelNumber, pdf };
    },

    async deleteLabel(parcelId: number): Promise<void> {
      const response = await post(
        "deleteLabel",
        "DeleteLabels",
        { ParcelIdList: [parcelId] },
        DeleteLabelsResponseSchema
      );

      if (response.DeleteLabelsErrorList.length > 0) {
        throw new GlsError("deleteLabel", {
          kind: "rejected",
          errors: response.DeleteLabelsErrorList.map(errorInfo),
        });
      }

      if (!response.SuccessfullyDeletedList.some((d) => d.ParcelId === parcelId)) {
        throw new GlsError("deleteLabel", {
          kind: "unreachable",
          reason: `parcel ${parcelId} missing from the deleted list`,
        });
      }
    },
  };
}

interface WireAddress {
  Name: string;
  Street: string;
  HouseNumber?: string;
  HouseNumberInfo?: string;
  City: string;
  ZipCode: string;
  CountryIsoCode: string;
  ContactName?: string;
  ContactPhone?: string;
  ContactEmail?: string;
}

interface WireParcel {
  ClientNumber: number;
  ClientReference: string;
  Count: 1;
  Content: string;
  PickupAddress: WireAddress;
  DeliveryAddress: WireAddress;
  CODAmount?: number;
  CODReference?: string;
  CODCurrency?: string;
}

function wireParcel(parcel: GlsParcelRequest, clientNumber: number): WireParcel {
  const wire: WireParcel = {
    ClientNumber: clientNumber,
    ClientReference: parcel.clientReference,
    Count: 1,
    Content: parcel.content,
    PickupAddress: wireAddress(parcel.pickupAddress),
    DeliveryAddress: wireAddress(parcel.deliveryAddress),
  };

  if (!parcel.cashOnDelivery) {
    return wire;
  }

  return {
    ...wire,
    CODAmount: parcel.cashOnDelivery.amount,
    CODReference: parcel.cashOnDelivery.reference,
    CODCurrency: parcel.cashOnDelivery.currency,
  };
}

function wireAddress(address: GlsAddress): WireAddress {
  return {
    Name: address.name,
    Street: address.street,
    HouseNumber: address.houseNumber,
    HouseNumberInfo: address.houseNumberInfo,
    City: address.city,
    ZipCode: address.zipCode,
    CountryIsoCode: address.countryCode,
    ContactName: address.contactName,
    ContactPhone: address.contactPhone,
    ContactEmail: address.contactEmail,
  };
}

function errorInfo(error: z.output<typeof ErrorInfoSchema>): GlsErrorInfo {
  return { code: error.ErrorCode, description: error.ErrorDescription ?? "" };
}

function isPdf(bytes: Uint8Array): boolean {
  return PDF_MAGIC.every((byte, i) => bytes[i] === byte);
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
