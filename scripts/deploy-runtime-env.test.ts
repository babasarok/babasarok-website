import { describe, expect, it } from "vitest";
import { runtimeEnvFragment } from "./deploy-runtime-env";

const LIVE = {
  MYGLS_HU_ACCOUNT_ID: "100021942",
  MYGLS_HU_EMAIL: "live@example.com",
  MYGLS_HU_PASSWORD: "p$ss#word x",
};

const TEST = {
  TEST_MYGLS_HU_ACCOUNT_ID: "100000001",
  TEST_MYGLS_HU_EMAIL: "test@example.com",
  TEST_MYGLS_HU_PASSWORD: "test-secret",
};

describe("runtimeEnvFragment", () => {
  it("never carries the live GLS account into a preview", () => {
    const fragment = runtimeEnvFragment("preview", {
      ...LIVE,
      ...TEST,
      CLOUDFLARE_EMAIL_TOKEN: "token",
    });

    expect(fragment).toEqual({
      ok: true,
      text: "TEST_MYGLS_HU_ACCOUNT_ID='100000001'\nTEST_MYGLS_HU_EMAIL='test@example.com'\nTEST_MYGLS_HU_PASSWORD='test-secret'\n",
    });
  });

  it("carries the live account, email transport and label format into prod, not the test account", () => {
    const fragment = runtimeEnvFragment("prod", {
      ...LIVE,
      ...TEST,
      CLOUDFLARE_EMAIL_TOKEN: "token",
      GLS_LABEL_FORMAT: "A4_4x1",
    });

    expect(fragment).toEqual({
      ok: true,
      text: "CLOUDFLARE_EMAIL_TOKEN='token'\nMYGLS_HU_ACCOUNT_ID='100021942'\nMYGLS_HU_EMAIL='live@example.com'\nMYGLS_HU_PASSWORD='p$ss#word x'\nGLS_LABEL_FORMAT='A4_4x1'\n",
    });
  });

  it("stops a prod deploy without the live account, naming where to set it", () => {
    const fragment = runtimeEnvFragment("prod", { MYGLS_HU_EMAIL: "live@example.com" });

    expect(fragment.ok).toBe(false);

    if (fragment.ok) {
      return;
    }

    expect(fragment.problems).toHaveLength(2);
    expect(fragment.problems[0]).toMatch(/^MYGLS_HU_ACCOUNT_ID is missing: set it in Cloudflare/);
  });

  it("lets a preview deploy without the test account (the backend falls back to the fake)", () => {
    expect(runtimeEnvFragment("preview", {})).toEqual({ ok: true, text: "\n" });
  });

  it("refuses values the single-quoted env file cannot carry", () => {
    const fragment = runtimeEnvFragment("prod", { ...LIVE, MYGLS_HU_PASSWORD: "it's" });

    expect(fragment).toEqual({
      ok: false,
      problems: [
        "MYGLS_HU_PASSWORD contains a single quote or a line break, which the env file cannot carry",
      ],
    });
  });
});
