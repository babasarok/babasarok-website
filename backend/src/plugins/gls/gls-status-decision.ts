import type { GlsParcelStatus } from "./gls-client";

/** Status 1: the parcel is handed over to GLS — the buyer's "shipped" email may go out. */
const HANDOVER_CODES = new Set(["1"]);

/** 5/54/58/92: delivered (in person, to a ParcelShop/ParcelLocker, or picked up). */
const DELIVERED_CODES = new Set(["5", "54", "58", "92"]);

/** 16 no cash, 17 refused, 20 address problem, 23/40 returned to the sender. */
export const PROBLEM_CODES = ["16", "17", "20", "23", "40"];

export type GlsStatusAction =
  | { kind: "delivered" }
  | { kind: "problem"; status: GlsParcelStatus }
  | { kind: "shipped" }
  | { kind: "none" };

/** Whether the parcel ever reached GLS's network. */
export function wasHandedOver(statuses: readonly GlsParcelStatus[]): boolean {
  return statuses.some((s) => HANDOVER_CODES.has(s.code));
}

/**
 * The poll's pure decision, from the parcel's full status history ordered
 * oldest to newest. The latest status decides: a delivery is delivered, a
 * problem status is that problem. Earlier statuses matter only when the
 * latest one is transit noise (a delivery or problem stays the verdict, a
 * re-attempt's transit codes keep an earlier problem visible).
 */
export function glsStatusDecision(statuses: readonly GlsParcelStatus[]): GlsStatusAction {
  const ordered = orderedByDate(statuses);
  const latest = ordered.at(-1);

  if (!latest) {
    return { kind: "none" };
  }

  if (DELIVERED_CODES.has(latest.code)) {
    return { kind: "delivered" };
  }

  if (PROBLEM_CODES.includes(latest.code)) {
    return { kind: "problem", status: latest };
  }

  if (ordered.some((s) => DELIVERED_CODES.has(s.code))) {
    return { kind: "delivered" };
  }

  const latestProblem = ordered.findLast((s) => PROBLEM_CODES.includes(s.code));

  if (latestProblem) {
    return { kind: "problem", status: latestProblem };
  }

  if (ordered.some((s) => HANDOVER_CODES.has(s.code))) {
    return { kind: "shipped" };
  }

  return { kind: "none" };
}

/** Stable sort by status date; unparseable dates keep their original order. */
function orderedByDate(statuses: readonly GlsParcelStatus[]): GlsParcelStatus[] {
  return statuses
    .map((status, index) => ({ status, index }))
    .toSorted((a, b) => {
      const aDate = a.status.date;
      const bDate = b.status.date;

      if (aDate !== null && bDate !== null && aDate !== bDate) {
        return aDate - bDate;
      }

      return a.index - b.index;
    })
    .map(({ status }) => status);
}
