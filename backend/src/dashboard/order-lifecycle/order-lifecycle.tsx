/**
 * Dashboard extension for the OrderLifecyclePlugin: the order page's
 * "Munkafolyamat" block. Two owner actions the deposit branch needs
 * (ADR 0021 §4): recording the delivery variant's deposit (the dashboard's
 * manual-payment action can never record it — it records only the deficit)
 * and stamping when the owner started making the product.
 *
 * Type-checked by src/dashboard/tsconfig.json (`check:dashboard`); the typed
 * graphql documents come from the backend's generated schema (src/gql).
 */
import { useState, type ReactElement } from "react";
import { z } from "zod";
import { api, Button, defineDashboardExtension, type PageContextValue } from "@vendure/dashboard";
import { graphql } from "@/gql";
import { ErrorNotice } from "../shared";

const recordDepositMutation = graphql(`
  mutation RecordDepositPayment($orderId: ID!, $transactionId: String) {
    recordDepositPayment(orderId: $orderId, transactionId: $transactionId) {
      id
      state
    }
  }
`);

const markFulfillmentStartedMutation = graphql(`
  mutation MarkFulfillmentStarted($orderId: ID!) {
    markFulfillmentStarted(orderId: $orderId) {
      id
      state
      customFields
    }
  }
`);

const OrderLifecycleSchema = z.object({
  id: z.string(),
  code: z.string(),
  state: z.string(),
  shippingLines: z
    .array(
      z.object({
        shippingMethod: z
          .object({
            customFields: z.object({ deposit: z.number() }).nullish(),
          })
          .nullish(),
      })
    )
    .nullish(),
  customFields: z
    .object({
      fulfillmentStartedAt: z.string().nullish(),
    })
    .nullish(),
});

type OrderInfo = {
  id: string;
  deposit: number;
  state: string;
  fulfillmentStartedAt: string | null | undefined;
};

function orderInfo(context: PageContextValue): OrderInfo | null {
  const parsed = OrderLifecycleSchema.safeParse(context.entity);

  if (!parsed.success) {
    return null;
  }

  const { id, state, shippingLines, customFields } = parsed.data;

  return {
    id,
    state,
    deposit: shippingLines?.[0]?.shippingMethod?.customFields?.deposit ?? 0,
    fulfillmentStartedAt: customFields?.fulfillmentStartedAt ?? null,
  };
}

function OrderLifecycleBlock({ context }: { context: PageContextValue }): ReactElement {
  const info = orderInfo(context);
  const [busy, setBusy] = useState<"deposit" | "fulfillment" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  if (info === null) {
    return <ErrorNotice message="A rendelés munkafolyamata nem olvasható." />;
  }

  async function recordDeposit(): Promise<void> {
    setBusy("deposit");
    setProblem(null);

    try {
      await api.query(recordDepositMutation, { orderId: info.id });
      globalThis.location.reload();
    } catch (error) {
      setProblem(
        `Az előleg rögzítése nem sikerült: ${error instanceof Error ? error.message : String(error)}`
      );
      setBusy(null);
    }
  }

  async function markStarted(): Promise<void> {
    setBusy("fulfillment");
    setProblem(null);

    try {
      await api.query(markFulfillmentStartedMutation, { orderId: info.id });
      globalThis.location.reload();
    } catch (error) {
      setProblem(
        `A gyártás elindítása nem sikerült: ${error instanceof Error ? error.message : String(error)}`
      );
      setBusy(null);
    }
  }

  const depositRecordable = info.deposit > 0 && info.state === "ArrangingPayment";
  const startedAt = info.fulfillmentStartedAt;

  return (
    <div className="flex flex-col gap-3">
      {depositRecordable && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm">
            Előleg: <strong>{info.deposit.toLocaleString("hu-HU")} Ft</strong>
          </span>
          <Button
            type="button"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => void recordDeposit()}
          >
            Előleg rögzítése
          </Button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">
          {startedAt === null || startedAt === undefined
            ? "A gyártás még nincs elindítva."
            : `Gyártás elindítva: ${new Date(startedAt).toLocaleString("hu-HU")}`}
        </span>
        {(startedAt === null || startedAt === undefined) && (
          <Button
            type="button"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => void markStarted()}
          >
            Gyártás elindítva
          </Button>
        )}
      </div>
      {problem && <ErrorNotice message={problem} />}
    </div>
  );
}

// Extensions load for side effects only.
defineDashboardExtension({
  pageBlocks: [
    {
      id: "order-lifecycle",
      title: "Munkafolyamat",
      location: {
        pageId: "order-detail",
        column: "main",
        position: { blockId: "order-custom-fields", order: "after" },
      },
      component: OrderLifecycleBlock,
    },
  ],
});
