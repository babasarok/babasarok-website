import { describe, expect, it, vi, type Mock } from "vitest";
import { z } from "zod";
import { GlsError, type GlsClient, type GlsParcelRequest } from "./gls-client";
import { placeholderLabelPdf } from "./fake-gls-client";
import { createMyGlsClient, myGlsBaseUrl, passwordDigest } from "./mygls-client";

const PDF = Array.from(placeholderLabelPdf(1));

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
