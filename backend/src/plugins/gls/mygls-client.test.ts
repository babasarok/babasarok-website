import { describe, expect, it, vi, type Mock } from "vitest";
import { z } from "zod";
import { GlsError, type GlsClient, type GlsParcelRequest } from "./gls-client";
import { placeholderLabelPdf } from "./fake-gls-client";
import { createMyGlsClient, myGlsBaseUrl, passwordDigest } from "./mygls-client";

const PDF = Array.from(placeholderLabelPdf("FAKE GLS LABEL 1"));

const parcel: GlsParcelRequest = {
  clientReference: "ORD-1",
  content: "ORD-1",
  pickupAddress: {
    name: "Babasarok",
    street: "Fő utca",
    houseNumber: "1",
    city: "Telkibánya",
    zipCode: "3896",
    countryCode: "HU",
  },
  deliveryAddress: {
    name: "Teszt Címzett",
    street: "Váci utca",
    houseNumber: "10",
    houseNumberInfo: "2. emelet",
    city: "Budapest",
    zipCode: "1052",
    countryCode: "HU",
    contactPhone: "+36301234567",
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function printLabelsOk(): Response {
  return jsonResponse({
    Labels: PDF,
    PrintLabelsErrorList: [],
    PrintLabelsInfoList: [
      { ClientReference: "ORD-1", ParcelId: 16_466_168, ParcelNumber: 3_244_968_187 },
    ],
  });
}

function clientWith(fetchMock: typeof fetch): GlsClient {
  return createMyGlsClient({
    environment: "test",
    country: "HU",
    credentials: { username: "user@example.com", password: "secret", clientNumber: 100_021_942 },
    labelFormat: "A4_2x2",
    fetch: fetchMock,
  });
}

const SentBodySchema = z.looseObject({
  ParcelList: z.array(z.record(z.string(), z.unknown())).optional(),
});

function sentBody(fetchMock: Mock<typeof fetch>): z.output<typeof SentBodySchema> {
  const body = fetchMock.mock.calls[0]?.[1]?.body;

  if (typeof body !== "string") {
    throw new TypeError("expected a JSON string request body");
  }

  return SentBodySchema.parse(JSON.parse(body));
}

describe("myGlsBaseUrl", () => {
  it("only the live environment reaches the production host", () => {
    expect(myGlsBaseUrl("test", "HU")).toBe("https://api.test.mygls.hu/ParcelService.svc/json/");
    expect(myGlsBaseUrl("live", "HU")).toBe("https://api.mygls.hu/ParcelService.svc/json/");
  });
});

describe("passwordDigest", () => {
  it("is the SHA-512 digest as a 64-number array", () => {
    const digest = passwordDigest("abc");

    expect(digest).toHaveLength(64);
    expect(Buffer.from(digest).toString("hex")).toMatch(/^ddaf35a1/);
  });
});

describe("createLabel", () => {
  it("posts one parcel to PrintLabels and returns its ids and PDF", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(printLabelsOk());

    const label = await clientWith(fetchMock).createLabel(parcel);

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.test.mygls.hu/ParcelService.svc/json/PrintLabels"
    );

    expect(label.parcelId).toBe(16_466_168);
    expect(label.parcelNumber).toBe(3_244_968_187);
    expect(Array.from(label.pdf)).toEqual(PDF);

    const body = sentBody(fetchMock);

    expect(body).toMatchObject({
      Username: "user@example.com",
      Password: passwordDigest("secret"),
      TypeOfPrinter: "A4_2x2",
      WebshopEngine: "Vendure",
      ParcelList: [
        {
          ClientNumber: 100_021_942,
          ClientReference: "ORD-1",
          Count: 1,
          Content: "ORD-1",
          DeliveryAddress: { Street: "Váci utca", HouseNumber: "10", HouseNumberInfo: "2. emelet" },
        },
      ],
    });

    expect(body.ParcelList?.[0]).not.toHaveProperty("CODAmount");
  });

  it("sends cash on delivery as the parcel's COD fields", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(printLabelsOk());

    await clientWith(fetchMock).createLabel({
      ...parcel,
      cashOnDelivery: { amount: 12_345, reference: "ORD-1", currency: "HUF" },
    });

    expect(sentBody(fetchMock).ParcelList).toEqual([
      expect.objectContaining({ CODAmount: 12_345, CODReference: "ORD-1", CODCurrency: "HUF" }),
    ]);
  });

  it("reports GLS's error list as a rejection", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        Labels: null,
        PrintLabelsErrorList: [{ ErrorCode: 56, ErrorDescription: "Webshop engine is required!" }],
        PrintLabelsInfoList: [],
      })
    );

    const error = await clientWith(fetchMock)
      .createLabel(parcel)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GlsError);
    expect(error).toMatchObject({
      failure: {
        kind: "rejected",
        errors: [{ code: 56, description: "Webshop engine is required!" }],
      },
    });
  });

  it.each([
    ["a network failure", () => Promise.reject(new Error("socket hang up"))],
    ["an HTTP error", () => Promise.resolve(jsonResponse({}, 502))],
    ["an unexpected body", () => Promise.resolve(jsonResponse({ Something: "else" }))],
  ])("never retries and warns the parcel may exist after %s", async (_, respond) => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(respond);

    const error = await clientWith(fetchMock)
      .createLabel(parcel)
      .catch((e: unknown) => e);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(error).toMatchObject({ failure: { kind: "unreachable" } });
    expect(String(error)).toContain("check MyGLS before trying again");
  });

  it("refuses a created parcel without a PDF label", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        Labels: null,
        PrintLabelsErrorList: [],
        PrintLabelsInfoList: [
          { ClientReference: "ORD-1", ParcelId: 1, ParcelNumber: 3_244_968_187 },
        ],
      })
    );

    const error = await clientWith(fetchMock)
      .createLabel(parcel)
      .catch((e: unknown) => e);

    expect(String(error)).toContain("parcel 3244968187 was created but no PDF label came back");
  });
});

describe("deleteLabel", () => {
  it("posts the parcel id to DeleteLabels", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        DeleteLabelsErrorList: [],
        SuccessfullyDeletedList: [{ ParcelId: 16_466_168, SubParcelIdList: [] }],
      })
    );

    await clientWith(fetchMock).deleteLabel(16_466_168);

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.test.mygls.hu/ParcelService.svc/json/DeleteLabels"
    );

    expect(sentBody(fetchMock)).toMatchObject({ ParcelIdList: [16_466_168] });
  });

  it("reports an unknown parcel as a rejection", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        DeleteLabelsErrorList: [
          { ErrorCode: 4, ErrorDescription: "Parcel ID not exists", ParcelIdList: [1] },
        ],
        SuccessfullyDeletedList: [],
      })
    );

    await expect(clientWith(fetchMock).deleteLabel(1)).rejects.toMatchObject({
      failure: { kind: "rejected", errors: [{ code: 4 }] },
    });
  });
});

describe("getParcelStatuses", () => {
  it("posts the parcel numbers with the API language and maps the history", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        GetParcelListStatusesErrors: [],
        ParcelList: [
          {
            ParcelId: 16_466_168,
            ParcelNumber: 3_244_968_187,
            ClientNumber: 100_021_942,
            ClientReference: "ORD-1",
            Weight: null,
            ParcelStatusList: [
              {
                StatusCode: "1",
                StatusDate: "/Date(1764000000000+0100)/",
                StatusDescription: "A csomagot átadtuk a GLS-nek.",
                DepotNumber: "1234",
                DepotCity: "Miskolc",
                StatusInfo: null,
              },
              {
                StatusCode: "5",
                StatusDate: "2026-11-21T10:00:00.000Z",
                StatusDescription: "A csomagot kézbesítettük.",
                DepotNumber: "1234",
                DepotCity: "Miskolc",
              },
            ],
          },
        ],
      })
    );

    const result = await clientWith(fetchMock).getParcelStatuses([3_244_968_187]);

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.test.mygls.hu/ParcelService.svc/json/GetParcelListStatuses"
    );

    expect(sentBody(fetchMock)).toMatchObject({
      ParcelNumberList: [3_244_968_187],
      LanguageIsoCode: "HU",
    });

    expect(result.parcels).toEqual([
      {
        parcelId: 16_466_168,
        parcelNumber: 3_244_968_187,
        clientReference: "ORD-1",
        statuses: [
          { code: "1", date: 1_764_000_000_000, description: "A csomagot átadtuk a GLS-nek." },
          {
            code: "5",
            date: Date.parse("2026-11-21T10:00:00.000Z"),
            description: "A csomagot kézbesítettük.",
          },
        ],
      },
    ]);
    expect(result.errors).toEqual([]);
  });

  it("maps per-parcel errors without failing the call", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        GetParcelListStatusesErrors: [
          {
            ErrorCode: 26,
            ErrorDescription: "Parcel not handed over yet",
            ParcelIdList: [16_466_168],
            ClientReferenceList: ["ORD-1"],
          },
        ],
        ParcelList: [],
      })
    );

    const result = await clientWith(fetchMock).getParcelStatuses([3_244_968_187]);

    expect(result.parcels).toEqual([]);
    expect(result.errors).toEqual([
      {
        code: 26,
        description: "Parcel not handed over yet",
        parcelIds: [16_466_168],
        clientReferences: ["ORD-1"],
      },
    ]);
  });

  it("keeps unparseable dates as null", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        GetParcelListStatusesErrors: [],
        ParcelList: [
          {
            ParcelId: 1,
            ParcelNumber: 2,
            ClientReference: null,
            ParcelStatusList: [{ StatusCode: "1", StatusDate: "not a date" }],
          },
        ],
      })
    );

    const result = await clientWith(fetchMock).getParcelStatuses([2]);

    expect(result.parcels[0].statuses).toEqual([{ code: "1", date: null, description: "" }]);
  });

  it("treats an unreachable GLS like the other operations", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error("socket hang up"));

    await expect(clientWith(fetchMock).getParcelStatuses([2])).rejects.toMatchObject({
      failure: { kind: "unreachable" },
    });
  });
});
