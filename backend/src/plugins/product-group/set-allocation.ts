/**
 * The set-discount allocation, ported from the site's `src/lib/pricing/
 * setDiscount.ts` (the backend keeps its own copy until the cutover, ADR 0010
 * decision 6). One formed instance is one unit each of two or more distinct
 * set members whose material selections are pairwise compatible; sets are
 * processed by descending flat amount, and each basket unit is consumed at
 * most once. Leftover units earn nothing. See docs/specs/product-sets.md.
 */
export interface AllocationLine {
  /** The order line the units belong to. */
  lineId: string;
  /** The canonical product id the line sells. */
  productId: string;
  quantity: number;
  /** Gross unit price in whole forints, as the line is charged. */
  unitPrice: number;
  /** One entry per picked material field: the material and its chosen colors. */
  materials: ReadonlyArray<{ materialId: string; colors: readonly string[] }>;
}

export interface AllocationGroup {
  groupId: string;
  label: string;
  /** The flat forint amount one formed instance removes (positive). */
  discount: number;
  productIds: readonly string[];
}

export interface SetInstance {
  groupId: string;
  label: string;
  /** The member lines, one covered unit each, in allocation order. */
  members: string[];
  /** The set's unclamped flat amount, for the order email's provenance. */
  nominal: number;
  /** The amount actually removed: clamped to the covered units' subtotal. */
  amount: number;
}

interface RawInstance {
  groupId: string;
  label: string;
  members: string[];
  nominal: number;
}

/** A line's material picks as a counted multiset of canonical tuples. */
function materialEntries(line: AllocationLine): Map<string, number> {
  const counts = new Map<string, number>();

  for (const pick of line.materials) {
    if (pick.materialId === "") {
      continue;
    }

    const key = JSON.stringify({
      materialId: pick.materialId,
      colors: [...pick.colors].toSorted(),
    });

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function materialCount(entries: Map<string, number>): number {
  let total = 0;

  for (const count of entries.values()) {
    total += count;
  }

  return total;
}

/** Whether every selection in `small` appears in `large` at least as often. */
function isMaterialSubset(small: Map<string, number>, large: Map<string, number>): boolean {
  for (const [value, count] of small) {
    if ((large.get(value) ?? 0) < count) {
      return false;
    }
  }

  return true;
}

/**
 * Two lines count towards the same set when the smaller material selection is
 * a subset of the larger; equal counts require an exact match, and lines
 * without material selections match trivially.
 */
function materialsMatch(a: Map<string, number>, b: Map<string, number>): boolean {
  return materialCount(a) <= materialCount(b) ? isMaterialSubset(a, b) : isMaterialSubset(b, a);
}

/**
 * The basket's formed set instances, in allocation order, each with its
 * clamped amount. Pure and deterministic.
 */
export function allocateSetDiscounts(
  lines: readonly AllocationLine[],
  groups: readonly AllocationGroup[]
): SetInstance[] {
  const materials = new Map<string, Map<string, number>>();

  for (const line of lines) {
    materials.set(line.lineId, materialEntries(line));
  }

  const consumed = new Map<string, number>();
  const remaining = (line: AllocationLine): number =>
    line.quantity - (consumed.get(line.lineId) ?? 0);
  const compatible = (a: string, b: string): boolean => {
    const ma = materials.get(a) ?? new Map<string, number>();
    const mb = materials.get(b) ?? new Map<string, number>();

    return materialsMatch(ma, mb);
  };

  const rawInstances: RawInstance[] = [];
  // Biggest flat amount first so each unit lands in its most valuable set;
  // ties keep the group's order for determinism.
  const ordered = groups
    .map((group, index) => ({ group, index }))
    .filter(({ group }) => group.discount > 0)
    .toSorted((a, b) => b.group.discount - a.group.discount || a.index - b.index);

  for (const { group } of ordered) {
    const memberIds = new Set(group.productIds);

    for (;;) {
      const chosen: string[] = [];
      const usedProducts = new Set<string>();

      for (const line of lines) {
        if (
          !memberIds.has(line.productId) ||
          usedProducts.has(line.productId) ||
          remaining(line) <= 0
        ) {
          continue;
        }

        const pendingMembers = [...memberIds].filter(
          (id) => id !== line.productId && !usedProducts.has(id)
        );
        const joinableCount = (unit: AllocationLine): number =>
          pendingMembers.filter((id) =>
            lines.some(
              (other) =>
                other.productId === id &&
                remaining(other) > 0 &&
                compatible(unit.lineId, other.lineId) &&
                chosen.every((covered) => compatible(covered, other.lineId))
            )
          ).length;

        let candidate: AllocationLine | undefined;
        let candidateJoinable = -1;

        for (const other of lines) {
          if (
            other.productId !== line.productId ||
            remaining(other) <= 0 ||
            !chosen.every((covered) => compatible(covered, other.lineId))
          ) {
            continue;
          }

          const otherJoinable = joinableCount(other);

          if (
            candidate === undefined ||
            otherJoinable > candidateJoinable ||
            (otherJoinable === candidateJoinable && other.unitPrice > candidate.unitPrice)
          ) {
            candidate = other;
            candidateJoinable = otherJoinable;
          }
        }

        if (candidate !== undefined) {
          chosen.push(candidate.lineId);
          usedProducts.add(candidate.productId);
        }
      }

      if (chosen.length < 2) {
        break;
      }

      for (const lineId of chosen) {
        consumed.set(lineId, (consumed.get(lineId) ?? 0) + 1);
      }

      rawInstances.push({
        groupId: group.groupId,
        label: group.label,
        members: chosen,
        nominal: group.discount,
      });
    }
  }

  const priceByLineId = new Map(lines.map((line) => [line.lineId, line.unitPrice]));

  return rawInstances.map((instance) => {
    let subtotal = 0;

    for (const lineId of instance.members) {
      subtotal += priceByLineId.get(lineId) ?? 0;
    }

    return {
      groupId: instance.groupId,
      label: instance.label,
      members: instance.members,
      nominal: instance.nominal,
      amount: Math.min(instance.nominal, subtotal),
    };
  });
}
