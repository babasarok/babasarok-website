/** A line's material picks as a counted multiset of canonical tuples. */
function materialEntries(line) {
    const counts = new Map();
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
function materialCount(entries) {
    let total = 0;
    for (const count of entries.values()) {
        total += count;
    }
    return total;
}
/** Whether every selection in `small` appears in `large` at least as often. */
function isMaterialSubset(small, large) {
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
function materialsMatch(a, b) {
    return materialCount(a) <= materialCount(b) ? isMaterialSubset(a, b) : isMaterialSubset(b, a);
}
export function linesMaterialsMatch(a, b) {
    return materialsMatch(materialEntries(a), materialEntries(b));
}
/**
 * The basket's formed set instances, in allocation order, each with its
 * clamped amount. Pure and deterministic.
 */
export function allocateSetDiscounts(lines, groups) {
    const materials = new Map();
    for (const line of lines) {
        materials.set(line.lineId, materialEntries(line));
    }
    const consumed = new Map();
    const remaining = (line) => line.quantity - (consumed.get(line.lineId) ?? 0);
    const compatible = (a, b) => {
        const ma = materials.get(a) ?? new Map();
        const mb = materials.get(b) ?? new Map();
        return materialsMatch(ma, mb);
    };
    const rawInstances = [];
    // Biggest flat amount first so each unit lands in its most valuable set;
    // ties keep the group's order for determinism.
    const ordered = groups
        .map((group, index) => ({ group, index }))
        .filter(({ group }) => group.discount > 0)
        .toSorted((a, b) => b.group.discount - a.group.discount || a.index - b.index);
    for (const { group } of ordered) {
        const memberIds = new Set(group.productIds);
        for (;;) {
            const chosen = [];
            const usedProducts = new Set();
            for (const line of lines) {
                if (!memberIds.has(line.productId) ||
                    usedProducts.has(line.productId) ||
                    remaining(line) <= 0) {
                    continue;
                }
                const pendingMembers = [...memberIds].filter((id) => id !== line.productId && !usedProducts.has(id));
                const joinableCount = (unit) => pendingMembers.filter((id) => lines.some((other) => other.productId === id &&
                    remaining(other) > 0 &&
                    compatible(unit.lineId, other.lineId) &&
                    chosen.every((covered) => compatible(covered, other.lineId)))).length;
                let candidate;
                let candidateJoinable = -1;
                for (const other of lines) {
                    if (other.productId !== line.productId ||
                        remaining(other) <= 0 ||
                        !chosen.every((covered) => compatible(covered, other.lineId))) {
                        continue;
                    }
                    const otherJoinable = joinableCount(other);
                    if (candidate === undefined ||
                        otherJoinable > candidateJoinable ||
                        (otherJoinable === candidateJoinable && other.unitPrice > candidate.unitPrice)) {
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
