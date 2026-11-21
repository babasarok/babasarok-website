/**
 * Dashboard extension (wired via the GLS plugin): the order page's GLS label
 * block. GLS hands a label PDF out only once, so the backend keeps it
 * privately (ADR 0020) and this block downloads it through the admin API
 * for each live GLS fulfillment of the order.
 */
import { useState, type ReactElement } from "react";
import { z } from "zod";
import { api, Button, defineDashboardExtension, type PageContextValue } from "@vendure/dashboard";
import { graphql } from "@/gql";
import { ErrorNotice } from "../shared";

const glsLabelQuery = graphql(`
  query GlsLabel($fulfillmentId: ID!) {
    glsLabel(fulfillmentId: $fulfillmentId) {
      fileName
      base64
    }
  }
`);

const OrderFulfillmentsSchema = z.object({
  fulfillments: z
    .array(
      z.object({
        id: z.string(),
        method: z.string(),
        state: z.string(),
        trackingCode: z.string().nullable(),
      })
    )
    .nullish(),
});

type GlsFulfillment = { id: string; trackingCode: string };

function liveGlsFulfillments(context: PageContextValue): GlsFulfillment[] {
  const order = OrderFulfillmentsSchema.safeParse(context.entity);

  if (!order.success) {
    return [];
  }

  return (order.data.fulfillments ?? [])
    .filter((f) => f.method === "GLS" && f.state !== "Cancelled")
    .map((f) => ({ id: f.id, trackingCode: f.trackingCode ?? "" }));
}

function saveFile(fileName: string, base64: string): void {
  const bytes = Uint8Array.from(atob(base64), (char) => char.codePointAt(0) ?? 0);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function LabelDownload({ fulfillment }: { fulfillment: GlsFulfillment }): ReactElement {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function download(): Promise<void> {
    setBusy(true);
    setProblem(null);

    try {
      const { glsLabel } = await api.query(glsLabelQuery, { fulfillmentId: fulfillment.id });

      if (!glsLabel) {
        setProblem(
          "A címke PDF-je már nincs meg nálunk (kézbesítve vagy sztornózva) — a MyGLS-ben nyomtatható újra."
        );
        return;
      }

      saveFile(glsLabel.fileName, glsLabel.base64);
    } catch (error) {
      setProblem(
        `A címke letöltése nem sikerült: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm">{fulfillment.trackingCode}</span>
        <Button type="button" variant="secondary" disabled={busy} onClick={() => void download()}>
          Címke letöltése (PDF)
        </Button>
      </div>
      {problem && <ErrorNotice message={problem} />}
    </div>
  );
}

function GlsLabelBlock({ context }: { context: PageContextValue }): ReactElement {
  return (
    <div className="flex flex-col gap-3">
      {liveGlsFulfillments(context).map((fulfillment) => (
        <LabelDownload key={fulfillment.id} fulfillment={fulfillment} />
      ))}
    </div>
  );
}

// Extensions load for side effects only.
defineDashboardExtension({
  pageBlocks: [
    {
      id: "gls-label",
      title: "GLS-címke",
      location: {
        pageId: "order-detail",
        column: "main",
        position: { blockId: "fulfillment-details", order: "after" },
      },
      component: GlsLabelBlock,
      shouldRender: (context) => liveGlsFulfillments(context).length > 0,
    },
  ],
});
