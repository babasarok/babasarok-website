import { GlsError, type GlsClient, type GlsLabel, type GlsParcelRequest } from "./gls-client";

export interface FakeParcel {
  parcelId: number;
  parcelNumber: number;
  request: GlsParcelRequest;
}

const FIRST_PARCEL_ID = 900_000_001;

const FIRST_PARCEL_NUMBER = 90_000_000_001;

export class FakeGlsClient implements GlsClient {
  private readonly created = new Map<number, FakeParcel>();
  private nextIndex = 0;

  get parcels(): readonly FakeParcel[] {
    return [...this.created.values()];
  }

  async createLabel(parcel: GlsParcelRequest): Promise<GlsLabel> {
    const index = this.nextIndex++;
    const parcelId = FIRST_PARCEL_ID + index;
    const parcelNumber = FIRST_PARCEL_NUMBER + index;

    this.created.set(parcelId, { parcelId, parcelNumber, request: parcel });

    return { parcelId, parcelNumber, pdf: placeholderLabelPdf(parcelNumber) };
  }

  async deleteLabel(parcelId: number): Promise<void> {
    if (!this.created.delete(parcelId)) {
      throw new GlsError("deleteLabel", {
        kind: "rejected",
        errors: [{ code: 4, description: "Parcel ID not exists" }],
      });
    }
  }
}

export function placeholderLabelPdf(parcelNumber: number): Uint8Array {
  const text = `FAKE GLS LABEL ${parcelNumber}`;
  const stream = `BT /F1 18 Tf 40 760 Td (${text}) Tj ET`;

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];

  for (const [i, object] of objects.entries()) {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = body.length;
  const xrefRows = offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`);

  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${xrefRows.join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(body);
}
