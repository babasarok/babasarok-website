import {
  GlsError,
  type GlsClient,
  type GlsLabel,
  type GlsParcelRequest,
  type GlsParcelStatus,
  type GlsParcelStatuses,
} from "./gls-client";

export interface FakeParcel {
  parcelId: number;
  parcelNumber: number;
  request: GlsParcelRequest;
}

const PARCEL_ID_BASE = 1_000_000_000;

const PARCEL_NUMBER_BASE = 90_000_000_000;

const BOOT_OFFSET_RANGE = 1_000_000_000;

export class FakeGlsClient implements GlsClient {
  private readonly created = new Map<number, FakeParcel>();
  private readonly statuses = new Map<number, GlsParcelStatus[]>();
  private nextIndex = 0;

  constructor(private readonly bootOffset = Date.now() % BOOT_OFFSET_RANGE) {}

  get parcels(): readonly FakeParcel[] {
    return [...this.created.values()];
  }

  /** The polling tests' seam: GLS's own network is what reports these in production. */
  setStatuses(parcelNumber: number | string, statuses: readonly GlsParcelStatus[]): void {
    this.statuses.set(Number(parcelNumber), [...statuses]);
  }

  async createLabel(parcel: GlsParcelRequest): Promise<GlsLabel> {
    const index = this.bootOffset + this.nextIndex++;
    const parcelId = PARCEL_ID_BASE + index;
    const parcelNumber = PARCEL_NUMBER_BASE + index;

    this.created.set(parcelId, { parcelId, parcelNumber, request: parcel });

    return { parcelId, parcelNumber, pdf: placeholderLabelPdf(labelText(parcelNumber, parcel)) };
  }

  async deleteLabel(parcelId: number): Promise<void> {
    const parcel = this.created.get(parcelId);

    if (!parcel || !this.created.delete(parcelId)) {
      throw new GlsError("deleteLabel", {
        kind: "rejected",
        errors: [{ code: 4, description: "Parcel ID not exists" }],
      });
    }

    this.statuses.delete(parcel.parcelNumber);
  }

  async getParcelStatuses(
    parcelNumbers: readonly number[]
  ): Promise<{ parcels: GlsParcelStatuses[]; errors: [] }> {
    return {
      parcels: parcelNumbers.flatMap((parcelNumber) => {
        const statuses = this.statuses.get(parcelNumber) ?? [];

        if (statuses.length === 0) {
          return [];
        }

        const parcel = [...this.created.values()].find((p) => p.parcelNumber === parcelNumber);

        if (!parcel) {
          return [];
        }

        return [
          {
            parcelId: parcel.parcelId,
            parcelNumber: parcel.parcelNumber,
            clientReference: parcel.request.clientReference,
            statuses: [...statuses],
          },
        ];
      }),
      errors: [],
    };
  }
}

function labelText(parcelNumber: number, parcel: GlsParcelRequest): string {
  const cod = parcel.cashOnDelivery;

  if (!cod) {
    return `FAKE GLS LABEL ${parcelNumber}`;
  }

  return `FAKE GLS LABEL ${parcelNumber} COD ${cod.amount} ${cod.currency}`;
}

export function placeholderLabelPdf(text: string): Uint8Array {
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
