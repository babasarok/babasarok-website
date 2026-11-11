import { z } from "zod";
import { parseLineSelections, type LineSelections } from "@babasarok/pricing";
import type { Locale } from "@/lib/i18n";
import { productPath, selectionMaterialParams } from "@/lib/order/queryParams";
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
  | { kind: "active"; title: string; coveredUnits: number }
  | { kind: "pending-partner"; title: string }
  | { kind: "pending-material"; title: string; syncFromLineId: string | undefined };

export function lineSetState(line: OrderLine): LineSetStateView | undefined {
  const state = line.setState;

  if (state === null || state === undefined) {
    return undefined;
  }

  if (state.kind === "ACTIVE") {
    return { kind: "active", title: state.title, coveredUnits: state.coveredUnits };
  }

  if (state.kind === "PENDING_PARTNER") {
    return { kind: "pending-partner", title: state.title };
  }

  return {
    kind: "pending-material",
    title: state.title,
    syncFromLineId: state.materialSyncFromLineId ?? undefined,
  };
}

export interface PartnerLink {
  slug: string;
  name: string;
}

export type SetMembers = Record<string, PartnerLink[]>;

export function setMembersByGroup(
  groups: ReadonlyArray<{ id: string; kind: string; productIds: readonly string[] }>,
  products: ReadonlyArray<{ slug: string; name: string; definition: { id: string } }>
): SetMembers {
  return Object.fromEntries(
    groups
      .filter((group) => group.kind === "set")
      .map((group) => [
        group.id,
        group.productIds.flatMap((productId) => {
          const product = products.find((candidate) => candidate.definition.id === productId);

          return product === undefined ? [] : [{ slug: product.slug, name: product.name }];
        }),
      ])
  );
}

export function partnerLinks(line: OrderLine, order: Order, members: SetMembers): PartnerLink[] {
  if (line.setState?.kind !== "PENDING_PARTNER") {
    return [];
  }

  const inBasket = new Set(order.lines.map((other) => other.productVariant.product.slug));

  return (members[line.setState.groupId] ?? []).filter((member) => !inBasket.has(member.slug));
}

/** The partner's product page with the line's materials preselected, so adding it completes the set. */
export function partnerPath(partner: PartnerLink, line: OrderLine, locale: Locale): string {
  let selections: LineSelections;

  try {
    selections = parseLineSelections(line.customFields?.selections ?? null);
  } catch {
    return productPath(partner.slug, locale);
  }

  return productPath(partner.slug, locale, selectionMaterialParams(selections));
}
