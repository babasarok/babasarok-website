import { describe, expect, it } from "vitest";
import {
  barionClientFor,
  barionConfigFromEnv,
  barionCallbackUrl,
  barionRedirectUrl,
} from "./barion-config";
import { FakeBarionClient } from "./fake-barion-client";
import type { BarionConfig } from "./barion-config";

const BASES = {
  BARION_REDIRECT_BASE: "https://babasarok.net",
  PUBLIC_API_URL: "https://api.babasarok.net",
};

describe("barionConfigFromEnv", () => {
  it("falls back to the fake without credentials outside production", () => {
    expect(barionConfigFromEnv({}, false)).toEqual({
      mode: "fake",
      redirectBase: "http://localhost:4321",
      callbackBase: "http://localhost:4000",
    });
  });

  it("reads the sandbox shop with the test keys", () => {
    const config = barionConfigFromEnv(
      {
        ...BASES,
        TEST_BARION_POS_KEY: "12345678-abcd-abcd-abcd-123456789012",
        TEST_BARION_PAYEE_EMAIL: "bolt@babasarok.test",
      },
      false
    );

    expect(config).toMatchObject({ mode: "test", payeeEmail: "bolt@babasarok.test" });
  });

  it("throws on a partial test shop instead of half-configuring payments", () => {
    expect(() =>
      barionConfigFromEnv({ TEST_BARION_POS_KEY: "12345678-abcd-abcd-abcd-123456789012" }, false)
    ).toThrow(/TEST_BARION_PAYEE_EMAIL/);
  });

  it("boots production without the live shop as disabled, not crashed", () => {
    expect(barionConfigFromEnv({ ...BASES }, true)).toEqual({
      mode: "disabled",
      redirectBase: "https://babasarok.net",
      callbackBase: "https://api.babasarok.net",
    });
  });

  it("boots a disabled production even without the URL origins", () => {
    expect(barionConfigFromEnv({}, true)).toEqual({
      mode: "disabled",
      redirectBase: "http://localhost:4321",
      callbackBase: "http://localhost:4000",
    });
  });

  it("throws in production with an active shop but without the origins", () => {
    expect(() =>
      barionConfigFromEnv(
        {
          BARION_POS_KEY: "12345678-abcd-abcd-abcd-123456789012",
          BARION_PAYEE_EMAIL: "bolt@babasarok.test",
        },
        true
      )
    ).toThrow(/BARION_REDIRECT_BASE/);
  });

  it("throws on a configured sandbox shop without the origins instead of redirecting to localhost", () => {
    expect(() =>
      barionConfigFromEnv(
        {
          TEST_BARION_POS_KEY: "12345678-abcd-abcd-abcd-123456789012",
          TEST_BARION_PAYEE_EMAIL: "bolt@babasarok.test",
        },
        false
      )
    ).toThrow(/BARION_REDIRECT_BASE/);
  });

  it("rejects a non-URL base", () => {
    expect(() =>
      barionConfigFromEnv({ ...BASES, PUBLIC_API_URL: "api.babasarok.net" }, false)
    ).toThrow(/absolute URLs/);
  });

  it("prefers the live keys in production", () => {
    const config = barionConfigFromEnv(
      {
        ...BASES,
        TEST_BARION_POS_KEY: "test-key",
        TEST_BARION_PAYEE_EMAIL: "test@babasarok.test",
        BARION_POS_KEY: "12345678-abcd-abcd-abcd-123456789012",
        BARION_PAYEE_EMAIL: "bolt@babasarok.test",
      },
      true
    );

    expect(config.mode).toBe("live");
  });

  it("builds the redirect on the confirmation page and the callback on the API origin", () => {
    expect(barionRedirectUrl(BASES.BARION_REDIRECT_BASE, "ABCD1234")).toBe(
      "https://babasarok.net/payment/confirmation?orderCode=ABCD1234"
    );
    expect(barionCallbackUrl(BASES.PUBLIC_API_URL)).toBe(
      "https://api.babasarok.net/payments/barion/callback"
    );
  });

  it("builds the fake client for fake and disabled", () => {
    const testConfig: BarionConfig = {
      mode: "test",
      posKey: "12345678-abcd-abcd-abcd-123456789012",
      payeeEmail: "bolt@babasarok.test",
      redirectBase: BASES.BARION_REDIRECT_BASE,
      callbackBase: BASES.PUBLIC_API_URL,
    };

    expect(barionClientFor(testConfig)).not.toBeInstanceOf(FakeBarionClient);
    expect(
      barionClientFor({
        mode: "fake",
        redirectBase: BASES.BARION_REDIRECT_BASE,
        callbackBase: BASES.PUBLIC_API_URL,
      })
    ).toBeInstanceOf(FakeBarionClient);
    expect(
      barionClientFor({
        mode: "disabled",
        redirectBase: BASES.BARION_REDIRECT_BASE,
        callbackBase: BASES.PUBLIC_API_URL,
      })
    ).toBeInstanceOf(FakeBarionClient);
  });
});
