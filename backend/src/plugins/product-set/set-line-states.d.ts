import { type AllocationGroup, type AllocationLine, type SetInstance } from "./set-allocation";
export interface MaterialFieldChoice {
    fieldId: string;
    offeredMaterialIds: readonly string[];
    pickedMaterialId: string;
}
export interface StateLine extends AllocationLine {
    materialFields: readonly MaterialFieldChoice[];
}
export type LineSetState = {
    kind: "active";
    groupId: string;
    title: string;
    coveredUnits: number;
} | {
    kind: "pending-partner";
    groupId: string;
    title: string;
} | {
    kind: "pending-material";
    groupId: string;
    title: string;
    materialSyncFromLineId: string | null;
};
export interface SetInstanceView {
    groupId: string;
    title: string;
    amount: number;
    lines: Array<{
        lineId: string;
        units: number;
    }>;
}
export declare function instanceViews(instances: readonly SetInstance[]): SetInstanceView[];
/**
 * Each line's set state against the allocation: active when its units are
 * covered by formed instances (the biggest covering set wins), otherwise the
 * pending hint of the biggest set it belongs to. Lines in no set are absent.
 */
export declare function lineSetStates(lines: readonly StateLine[], groups: readonly AllocationGroup[], instances: readonly SetInstance[]): Map<string, LineSetState>;
