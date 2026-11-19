import { describe, expect, it } from "vitest";
import { FakeGlsClient } from "./fake-gls-client";
import { glsClientFor, glsConfigFromEnv } from "./gls-config";

const LIVE = {
  MYGLS_HU_ACCOUNT_ID: "100021942",
  MYGLS_HU_EMAIL: "live@example.com",
  MYGLS_HU_PASSWORD: "live-secret",
};

const TEST = {
  TEST_MYGLS_HU_ACCOUNT_ID: "100000001",
  TEST_MYGLS_HU_EMAIL: "test@example.com",
  TEST_MYGLS_HU_PASSWORD: "test-secret",
};

describe("glsConfigFromEnv outside production", () => {
  it("never uses the live account, even when its credentials are present", () => {
    expect(glsConfigFromEnv(LIVE, false)).toEqual({ mode: "fake", labelFormat: "A4_2x2" });

    expect(glsConfigFromEnv({ ...LIVE, ...TEST }, false)).toEqual({
      mode: "test",
      labelFormat: "A4_2x2",
      credentials: {
        username: "test@example.com",
        password: "test-secret",
        clientNumber: 100_000_001,
      },
    });
  });

  it("uses the fake without test credentials", () => {
    expect(glsConfigFromEnv({}, false)).toEqual({ mode: "fake", labelFormat: "A4_2x2" });
    expect(glsConfigFromEnv({ TEST_MYGLS_HU_EMAIL: "" }, false).mode).toBe("fake");
  });

  it("refuses a half-configured test account, naming the missing variable", () => {
    expect(() => glsConfigFromEnv({ ...TEST, TEST_MYGLS_HU_PASSWORD: undefined }, false)).toThrow(
      /TEST_MYGLS_HU_PASSWORD/
    );

    expect(() => glsConfigFromEnv({ ...TEST, TEST_MYGLS_HU_ACCOUNT_ID: "abc" }, false)).toThrow(
      /TEST_MYGLS_HU_ACCOUNT_ID: must be the numeric GLS client number/
    );
  });
});

describe("glsConfigFromEnv in production", () => {
  it("uses the live account and ignores the test one", () => {
    expect(glsConfigFromEnv({ ...LIVE, ...TEST }, true)).toEqual({
      mode: "live",
      labelFormat: "A4_2x2",
      credentials: {
        username: "live@example.com",
        password: "live-secret",
        clientNumber: 100_021_942,
      },
    });
  });

  it("refuses to fall back to the fake or the test account", () => {
    expect(() => glsConfigFromEnv({}, true)).toThrow(/MYGLS_HU_ACCOUNT_ID/);
    expect(() => glsConfigFromEnv(TEST, true)).toThrow(/live GLS account/);
  });
});

describe("label format", () => {
  it("defaults to A4_2x2 and accepts the PDF formats", () => {
    expect(glsConfigFromEnv({ GLS_LABEL_FORMAT: "" }, false).labelFormat).toBe("A4_2x2");
    expect(glsConfigFromEnv({ GLS_LABEL_FORMAT: "Thermo" }, false).labelFormat).toBe("Thermo");
  });

  it("refuses anything else", () => {
    expect(() => glsConfigFromEnv({ GLS_LABEL_FORMAT: "ThermoZPL" }, false)).toThrow(
      /GLS_LABEL_FORMAT must be one of A4_2x2, A4_4x1, Thermo/
    );
  });
});

describe("glsClientFor", () => {
  it("builds the fake for the fake mode", () => {
    expect(glsClientFor({ mode: "fake", labelFormat: "A4_2x2" })).toBeInstanceOf(FakeGlsClient);
  });
});
