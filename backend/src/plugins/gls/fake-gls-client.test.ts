import { describe, expect, it } from "vitest";
import { FakeGlsClient, placeholderLabelPdf } from "./fake-gls-client";
import type { GlsParcelRequest } from "./gls-client";

const parcel: GlsParcelRequest = {
  clientReference: "ORD-1",
  content: "ORD-1",
  pickupAddress: {
    name: "Babasarok",
    street: "Fő utca",
    city: "Telkibánya",
    zipCode: "3896",
    countryCode: "HU",
  },
  deliveryAddress: {
    name: "Teszt Címzett",
    street: "Váci utca",
    city: "Budapest",
    zipCode: "1052",
    countryCode: "HU",
  },
};

describe("FakeGlsClient", () => {
  it("creates a new parcel on every call, like GLS, even for a repeated reference", async () => {
    const client = new FakeGlsClient();

    const first = await client.createLabel(parcel);
    const second = await client.createLabel(parcel);

    expect(second.parcelId).not.toBe(first.parcelId);
    expect(second.parcelNumber).not.toBe(first.parcelNumber);
    expect(client.parcels.map((p) => p.request.clientReference)).toEqual(["ORD-1", "ORD-1"]);
  });

  it("deletes a parcel once and rejects deleting it again with GLS's code 4", async () => {
    const client = new FakeGlsClient();
    const label = await client.createLabel(parcel);

    await client.deleteLabel(label.parcelId);

    expect(client.parcels).toEqual([]);

    await expect(client.deleteLabel(label.parcelId)).rejects.toMatchObject({
      failure: { kind: "rejected", errors: [{ code: 4 }] },
    });
  });
});

describe("FakeGlsClient label text", () => {
  it("prints the cash-on-delivery amount like a real label", async () => {
    const label = await new FakeGlsClient(0).createLabel({
      ...parcel,
      cashOnDelivery: { amount: 15_000, reference: "ORD-1", currency: "HUF" },
    });

    expect(new TextDecoder().decode(label.pdf)).toContain(
      `FAKE GLS LABEL ${label.parcelNumber} COD 15000 HUF`
    );
  });
});

describe("FakeGlsClient across restarts", () => {
  it("does not reuse the previous process's parcel numbers", async () => {
    const before = await new FakeGlsClient(1000).createLabel(parcel);
    const after = await new FakeGlsClient(2000).createLabel(parcel);

    expect(after.parcelNumber).not.toBe(before.parcelNumber);
    expect(after.parcelId).not.toBe(before.parcelId);
  });
});

describe("placeholderLabelPdf", () => {
  it("is a structurally valid PDF whose xref points at its objects", () => {
    const text = new TextDecoder().decode(placeholderLabelPdf("FAKE GLS LABEL 90000000001"));

    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("FAKE GLS LABEL 90000000001");

    const startxref = Number(/startxref\n(\d+)/.exec(text)?.[1]);

    expect(text.slice(startxref).startsWith("xref\n")).toBe(true);

    const offsets = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));

    expect(offsets).toHaveLength(5);

    for (const [i, offset] of offsets.entries()) {
      expect(text.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true);
    }
  });
});
