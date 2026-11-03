import { z } from "zod";
import type { Order, OrderLine } from "./schemas";

export const SetDiscountSchema = z.object({
  groupId: z.string(),
  title: z.string(),
  amount: z.number(),
  lines: z.array(z.object({ orderLineId: z.string(), units: z.number().int() })),
});

export const SetStateSchema = z.object({
  kind: z.enum(["ACTIVE", "PENDING_PARTNER", "PENDING_MATERIAL"]),
  groupId: z.string(),
  title: z.string(),
  coveredUnits: z.number().int(),
  materialSyncFromLineId: z.string().nullable(),
});

export const SET_ORDER_FIELDS = "setDiscounts { groupId title amount lines { orderLineId units } }";
export const SET_LINE_FIELDS =
  "setState { kind groupId title coveredUnits materialSyncFromLineId }";

export interface SetSectionEntry {
  groupId: string;
  title: string;
  amount: number;
  members: Array<{ lineId: string; name: string; units: number }>;
}

export function setSection(order: Order): SetSectionEntry[] {
  return (order.setDiscounts ?? []).map((discount) => ({
    groupId: discount.groupId,
    title: discount.title,
    amount: discount.amount,
    members: discount.lines.flatMap((member) => {
      const line = order.lines.find((candidate) => candidate.id === member.orderLineId);

      return line === undefined
        ? []
        : [{ lineId: line.id, name: line.productVariant.product.name, units: member.units }];
    }),
  }));
}

export type LineSetStateView =
  | { kind: "active"; message: string }
  | { kind: "pending-partner"; message: string }
  | { kind: "pending-material"; message: string; syncFromLineId: string | undefined };

export function lineSetState(line: OrderLine): LineSetStateView | undefined {
  const state = line.setState;

  if (state === null || state === undefined) {
    return undefined;
  }

  if (state.kind === "ACTIVE") {
    return {
      kind: "active",
      message: `${state.title}: a szett kedvezmény aktív (${state.coveredUnits.toString()} db-ra).`,
    };
  }

  if (state.kind === "PENDING_PARTNER") {
    return {
      kind: "pending-partner",
      message: `${state.title}: add hozzá a szett egy másik darabját, és megkapod a kedvezményt.`,
    };
  }

  return {
    kind: "pending-material",
    message: `${state.title}: egyeztesd az anyagot a szett darabjához a kedvezményhez.`,
    syncFromLineId: state.materialSyncFromLineId ?? undefined,
  };
}
