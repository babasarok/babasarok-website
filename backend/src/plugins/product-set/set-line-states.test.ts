import { describe, expect, it } from "vitest";
import { allocateSetDiscounts, type AllocationGroup } from "./set-allocation";
import { instanceViews, lineSetStates, type StateLine } from "./set-line-states";

function line(
  lineId: string,
  productId: string,
  options: { quantity?: number; picked?: string; offered?: string[] } = {}
): StateLine {
  const picked = options.picked ?? "";

  return {
    lineId,
    productId,
    quantity: options.quantity ?? 1,
    unitPrice: 5000,
    materials: picked === "" ? [] : [{ materialId: picked, colors: [] }],
    materialFields:
      picked === ""
        ? []
        : [
            {
              fieldId: "anyag",
              offeredMaterialIds: options.offered ?? [picked],
              pickedMaterialId: picked,
            },
          ],
  };
}

const szett: AllocationGroup = {
  groupId: "szett",
  label: "Szett",
  discount: 1000,
  productIds: ["a", "b"],
};

function states(lines: StateLine[], groups = [szett]) {
  return lineSetStates(lines, groups, allocateSetDiscounts(lines, groups));
}

describe("instanceViews", () => {
  it("counts the units each line contributes", () => {
    const lines = [line("1", "a", { quantity: 2 }), line("2", "b", { quantity: 2 })];

    expect(instanceViews(allocateSetDiscounts(lines, [szett]))).toEqual([
      {
        groupId: "szett",
        title: "Szett",
        amount: 1000,
        lines: [
          { lineId: "1", units: 1 },
          { lineId: "2", units: 1 },
        ],
      },
      expect.objectContaining({ amount: 1000 }),
    ]);
  });
});

describe("lineSetStates", () => {
  it("is active with the covered unit count", () => {
    const result = states([line("1", "a", { quantity: 3 }), line("2", "b")]);

    expect(result.get("1")).toEqual({
      kind: "active",
      groupId: "szett",
      title: "Szett",
      coveredUnits: 1,
    });
    expect(result.get("2")?.kind).toBe("active");
  });

  it("is pending-partner when no partner is in the basket", () => {
    expect(states([line("1", "a")]).get("1")).toEqual({
      kind: "pending-partner",
      groupId: "szett",
      title: "Szett",
    });
  });

  it("stays active for a line whose extra units found no partner", () => {
    const result = states([line("1", "a", { quantity: 2 }), line("2", "b")]);

    expect(result.get("1")?.kind).toBe("active");
  });

  it("offers a material sync from the partner when its material is offered", () => {
    const result = states([
      line("1", "a", { picked: "x", offered: ["x", "y"] }),
      line("2", "b", { picked: "y", offered: ["y"] }),
    ]);

    expect(result.get("1")).toEqual({
      kind: "pending-material",
      groupId: "szett",
      title: "Szett",
      materialSyncFromLineId: "2",
    });
  });

  it("offers no sync when the partner's material is not offered on the line", () => {
    const result = states([
      line("1", "a", { picked: "x", offered: ["x"] }),
      line("2", "b", { picked: "y", offered: ["y"] }),
    ]);

    expect(result.get("1")).toMatchObject({
      kind: "pending-material",
      materialSyncFromLineId: null,
    });
  });

  it("omits lines that are in no set", () => {
    expect(states([line("1", "z")]).has("1")).toBe(false);
  });
});
