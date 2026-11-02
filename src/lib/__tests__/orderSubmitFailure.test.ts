import { afterEach, describe, expect, it, vi } from "vitest";
import { submitOrder, type OrderDetails } from "@/lib/order/submit";
import { reportClientError } from "@/lib/errorReport";
import type * as ErrorReport from "@/lib/errorReport";
import type { SubmitOrderResult } from "@/lib/order/submit";
import { makeDelivery, makeProduct } from "./fixtures";

vi.mock("@/lib/errorReport", async (importOriginal) => ({
  ...(await importOriginal<typeof ErrorReport>()),
  reportClientError: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(reportClientError).mockClear();
});

const order: OrderDetails = {
  name: "Teszt Elek",
  email: "teszt@example.com",
  phone: "+36301234567",
  deliveryMethod: makeDelivery("Foxpost automata", 990, "foxpost"),
  address: undefined,
  products: [makeProduct({ title: "Pólya", price: 8000 })],
  threadColors: [],
  productGroups: [],
  termsAccepted: true,
};

async function submitWith(fetchImpl: () => Promise<unknown>): Promise<SubmitOrderResult> {
  vi.stubGlobal("fetch", vi.fn(fetchImpl));
  return submitOrder(order, { message: "", transactionId: "3f9a1c2e-0000-4000-8000-000000000000" });
}

describe("failed order submission", () => {
  it("names a network failure with the reference code and reports it", async () => {
    const result = await submitWith(() => Promise.reject(new TypeError("Load failed")));

    expect(result).toEqual({
      ok: false,
      message: expect.stringContaining("(hálózati hiba, kód: 3f9a1c2e)") as string,
    });
    expect(reportClientError).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "order",
        reference: "3f9a1c2e",
        message: "TypeError: Load failed",
      })
    );
  });

  it("names a non-JSON reply by its HTTP status", async () => {
    const result = await submitWith(() =>
      Promise.resolve({ status: 502, json: () => Promise.reject(new SyntaxError("bad json")) })
    );

    expect(result.ok || result.message).toContain("(szerverhiba 502, kód: 3f9a1c2e)");
  });

  it("reports GraphQL errors", async () => {
    await submitWith(() =>
      Promise.resolve({
        status: 200,
        json: () => Promise.resolve({ errors: [{ message: "Bad input" }] }),
      })
    );

    expect(reportClientError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Bad input" })
    );
  });

  it("shows the backend's own rejection message", async () => {
    const result = await submitWith(() =>
      Promise.resolve({
        status: 200,
        json: () =>
          Promise.resolve({
            data: {
              submitQuoteOrder: {
                __typename: "SubmitQuoteOrderError",
                errorCode: "VALIDATION",
                message: "email: Invalid",
              },
            },
          }),
      })
    );

    expect(result.ok || result.message).toContain("(email: Invalid, kód: 3f9a1c2e)");
  });

  it("reports nothing on success", async () => {
    const result = await submitWith(() =>
      Promise.resolve({
        status: 200,
        json: () =>
          Promise.resolve({
            data: { submitQuoteOrder: { __typename: "SubmitQuoteOrderSuccess", orderCode: "C" } },
          }),
      })
    );

    expect(result).toEqual({ ok: true });
    expect(reportClientError).not.toHaveBeenCalled();
  });
});
