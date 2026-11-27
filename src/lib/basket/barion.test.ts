import { describe, expect, it } from "vitest";
import {
  barionRefusalKey,
  confirmationView,
  parseConfirmationParams,
  POLL_BUDGET_MS,
  POLL_INTERVAL_MS,
} from "./barion";

describe("parseConfirmationParams", () => {
  it("reads the gateway redirect's order and payment ids", () => {
    expect(
      parseConfirmationParams(new URLSearchParams("orderCode=ABC123&paymentId=pay-1"))
    ).toEqual({ orderCode: "ABC123", paymentId: "pay-1" });
  });

  it("reads the wizard's failure redirect, which carries no payment id", () => {
    expect(parseConfirmationParams(new URLSearchParams("orderCode=ABC123"))).toEqual({
      orderCode: "ABC123",
      paymentId: undefined,
    });
  });

  it("refuses a redirect missing the order code", () => {
    expect(parseConfirmationParams(new URLSearchParams("paymentId=pay-1"))).toBeUndefined();
    expect(parseConfirmationParams(new URLSearchParams(""))).toBeUndefined();
  });

  it("refuses empty ids", () => {
    expect(
      parseConfirmationParams(new URLSearchParams("orderCode=&paymentId=pay-1"))
    ).toBeUndefined();
    expect(
      parseConfirmationParams(new URLSearchParams("orderCode=ABC123&paymentId="))
    ).toBeUndefined();
  });
});

describe("confirmationView", () => {
  it("shows processing on arrival and while the payment runs", () => {
    expect(confirmationView(undefined, 0)).toBe("processing");
    expect(confirmationView("Processing", POLL_INTERVAL_MS)).toBe("processing");
  });

  it("renders by the polled status only", () => {
    expect(confirmationView("Succeeded", 0)).toBe("succeeded");
    expect(confirmationView("Failed", 0)).toBe("failed");
    expect(confirmationView("Expired", 0)).toBe("failed");
    expect(confirmationView("Succeeded", POLL_BUDGET_MS)).toBe("succeeded");
    expect(confirmationView("Failed", POLL_BUDGET_MS)).toBe("failed");
  });

  it("stops on the budget with the processing copy kept", () => {
    expect(confirmationView(undefined, POLL_BUDGET_MS - 1)).toBe("processing");
    expect(confirmationView(undefined, POLL_BUDGET_MS)).toBe("stalled");
    expect(confirmationView("Processing", POLL_BUDGET_MS + POLL_INTERVAL_MS)).toBe("stalled");
  });
});

describe("barionRefusalKey", () => {
  it("maps the coded refusals to their locale keys", () => {
    expect(barionRefusalKey('{"code":"BARION_INTENT_FAILED"}')).toBe(
      "refusals.BARION_INTENT_FAILED"
    );
    expect(barionRefusalKey('{"code":"BARION_ORDER_STATE"}')).toBe("refusals.BARION_ORDER_STATE");
  });

  it("finds the code inside the API's error text", () => {
    expect(barionRefusalKey('HTTP 400: {"code":"BARION_INTENT_FAILED"}; other message')).toBe(
      "refusals.BARION_INTENT_FAILED"
    );
  });

  it("leaves plain text and other codes alone", () => {
    expect(barionRefusalKey("payment failed")).toBeUndefined();
    expect(barionRefusalKey('{"code":"CHECKOUT_INCOMPLETE"}')).toBeUndefined();
  });
});
