import { describe, expect, it } from "vitest";
import type { GlsParcelStatus } from "./gls-client";
import { glsStatusDecision } from "./gls-status-decision";

function status(code: string, date: number | null, description = ""): GlsParcelStatus {
  return { code, date, description };
}

describe("glsStatusDecision", () => {
  it("does nothing before hand-over", () => {
    expect(glsStatusDecision([])).toEqual({ kind: "none" });
    expect(glsStatusDecision([status("0.1", 100)])).toEqual({ kind: "none" });
  });

  it("ships on hand-over", () => {
    expect(glsStatusDecision([status("1", 100, "átadva a GLS-nek")])).toEqual({ kind: "shipped" });
  });

  it("ships on transit after hand-over", () => {
    expect(
      glsStatusDecision([status("1", 100), status("31", 200, "szállítás alatt"), status("55", 300)])
    ).toEqual({ kind: "shipped" });
  });

  it("delivers on every delivered code", () => {
    for (const code of ["5", "54", "58", "92"]) {
      expect(glsStatusDecision([status("1", 100), status(code, 200)])).toEqual({
        kind: "delivered",
      });
    }
  });

  it("delivered beats an earlier problem (the re-attempt succeeded)", () => {
    expect(
      glsStatusDecision([
        status("1", 100),
        status("17", 200, "címzett elutasította"),
        status("5", 300),
      ])
    ).toEqual({ kind: "delivered" });
  });

  it("reports the latest problem code", () => {
    expect(
      glsStatusDecision([
        status("1", 100),
        status("16", 200, "nem volt készpénz"),
        status("20", 300),
      ])
    ).toEqual({ kind: "problem", status: status("20", 300) });
    expect(glsStatusDecision([status("40", 100)])).toEqual({
      kind: "problem",
      status: status("40", 100),
    });
  });

  it("orders by status date, not list order", () => {
    expect(
      glsStatusDecision([status("5", 200, "kézbesítve"), status("16", 300, "nem volt készpénz")])
    ).toEqual({ kind: "problem", status: status("16", 300, "nem volt készpénz") });
  });

  it("keeps list order when dates are unparseable", () => {
    expect(glsStatusDecision([status("16", null), status("20", null)])).toEqual({
      kind: "problem",
      status: status("20", null),
    });
  });

  it("a problem before hand-over still reports (the parcel has moved back to GLS)", () => {
    expect(glsStatusDecision([status("23", 100)])).toEqual({
      kind: "problem",
      status: status("23", 100),
    });
  });
});
