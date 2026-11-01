import { describe, expect, it } from "vitest";
import { sortDefinitions } from "./definition-sort";

type Row = { productId: string; definition: { label: string; basePrice: number } };

function row(productId: string, label: string, basePrice: number): Row {
  return { productId, definition: { label, basePrice } };
}

const rows = [row("p2", "Éva", 200), row("p1", "Alfa", 300), row("p3", "Zoltán", 100)];

describe("sortDefinitions", () => {
  it("sorts by a whitelisted column with Hungarian string collation", () => {
    expect(sortDefinitions(rows, { label: "ASC" }).map((r) => r.productId)).toEqual([
      "p1",
      "p2",
      "p3",
    ]);
    expect(sortDefinitions(rows, { basePrice: "DESC" }).map((r) => r.productId)).toEqual([
      "p1",
      "p2",
      "p3",
    ]);
    expect(sortDefinitions(rows, { productId: "ASC" }).map((r) => r.productId)).toEqual([
      "p1",
      "p2",
      "p3",
    ]);
  });

  it("keeps the default order for an empty, unknown or unparseable sort", () => {
    const defaultOrder = ["p2", "p1", "p3"];

    expect(sortDefinitions(rows, {}).map((r) => r.productId)).toEqual(defaultOrder);
    expect(sortDefinitions(rows, { syncState: "DESC" }).map((r) => r.productId)).toEqual(
      defaultOrder
    );
    expect(sortDefinitions(rows, [{ id: "label", desc: true }]).map((r) => r.productId)).toEqual(
      defaultOrder
    );
    expect(sortDefinitions(rows, null).map((r) => r.productId)).toEqual(defaultOrder);
    expect(sortDefinitions(rows, { label: "SIDEWAYS" }).map((r) => r.productId)).toEqual(
      defaultOrder
    );
  });

  it("applies clauses in sequence with a stable base order", () => {
    const tied = [row("b", "X", 1), row("a", "X", 1), row("c", "Y", 1)];

    expect(sortDefinitions(tied, { label: "ASC" }).map((r) => r.productId)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });
});
