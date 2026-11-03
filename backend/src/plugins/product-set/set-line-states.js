import { linesMaterialsMatch, } from "./set-allocation";
export function instanceViews(instances) {
    return instances.map((instance) => {
        const units = new Map();
        for (const lineId of instance.members) {
            units.set(lineId, (units.get(lineId) ?? 0) + 1);
        }
        return {
            groupId: instance.groupId,
            title: instance.label,
            amount: instance.amount,
            lines: [...units].map(([lineId, count]) => ({ lineId, units: count })),
        };
    });
}
/** Whether copying `partner`'s material picks onto `item` yields offered picks on every field. */
function canSyncMaterials(item, partner) {
    if (item.materialFields.length !== partner.materialFields.length) {
        return false;
    }
    return item.materialFields.every((field) => {
        const partnerField = partner.materialFields.find((other) => other.fieldId === field.fieldId);
        if (partnerField === undefined || partnerField.pickedMaterialId === "") {
            return true;
        }
        return field.offeredMaterialIds.includes(partnerField.pickedMaterialId);
    });
}
function pendingState(item, lines, groups, remaining) {
    const group = groups
        .filter((candidate) => candidate.productIds.includes(item.productId))
        .toSorted((a, b) => b.discount - a.discount)
        .at(0);
    if (group === undefined) {
        return undefined;
    }
    const partners = lines.filter((other) => other.productId !== item.productId &&
        group.productIds.includes(other.productId) &&
        remaining(other) > 0);
    const identity = { groupId: group.groupId, title: group.label };
    if (partners.length === 0 || partners.some((other) => linesMaterialsMatch(item, other))) {
        return { kind: "pending-partner", ...identity };
    }
    const syncable = partners.find((other) => canSyncMaterials(item, other));
    return {
        kind: "pending-material",
        ...identity,
        materialSyncFromLineId: syncable?.lineId ?? null,
    };
}
/**
 * Each line's set state against the allocation: active when its units are
 * covered by formed instances (the biggest covering set wins), otherwise the
 * pending hint of the biggest set it belongs to. Lines in no set are absent.
 */
export function lineSetStates(lines, groups, instances) {
    const coverage = new Map();
    const consumed = new Map();
    for (const instance of instances) {
        for (const lineId of instance.members) {
            consumed.set(lineId, (consumed.get(lineId) ?? 0) + 1);
            const bySet = coverage.get(lineId) ?? new Map();
            const entry = bySet.get(instance.groupId) ?? { instance, units: 0 };
            entry.units += 1;
            bySet.set(instance.groupId, entry);
            coverage.set(lineId, bySet);
        }
    }
    const remaining = (line) => line.quantity - (consumed.get(line.lineId) ?? 0);
    const states = new Map();
    for (const line of lines) {
        const entries = [...(coverage.get(line.lineId)?.values() ?? [])];
        if (entries.length > 0) {
            const best = entries.reduce((a, b) => (b.instance.amount > a.instance.amount ? b : a));
            states.set(line.lineId, {
                kind: "active",
                groupId: best.instance.groupId,
                title: best.instance.label,
                coveredUnits: consumed.get(line.lineId) ?? 0,
            });
            continue;
        }
        const pending = pendingState(line, lines, groups, remaining);
        if (pending !== undefined) {
            states.set(line.lineId, pending);
        }
    }
    return states;
}
