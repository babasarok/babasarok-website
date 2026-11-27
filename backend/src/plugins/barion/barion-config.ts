import { z } from "zod";
import type { BarionClient } from "./barion-client";
import { barionApiBase, createBarionApiClient } from "./api-client";
import { FakeBarionClient } from "./fake-barion-client";

export type BarionConfig =
  | {
      mode: "fake";
      redirectBase: string;
      callbackBase: string;
    }
  | {
      mode: "test" | "live";
      posKey: string;
      payeeEmail: string;
      redirectBase: string;
      callbackBase: string;
    };

type EnvSource = Readonly<Record<string, string | undefined>>;

const LIVE_KEYS = { posKey: "BARION_POS_KEY", payeeEmail: "BARION_PAYEE_EMAIL" } as const;

const TEST_KEYS = { posKey: "TEST_BARION_POS_KEY", payeeEmail: "TEST_BARION_PAYEE_EMAIL" } as const;

const UrlSchema = z.url();

/** The site origin the gateway redirects back to (Barion appends the paymentId). */
const REDIRECT_PATH = "/payment/confirmation";

/** The backend route Barion POSTs its state-change signal to. */
export const BARION_CALLBACK_PATH = "/payments/barion/callback";

export function barionRedirectUrl(redirectBase: string, orderCode: string): string {
  return `${redirectBase.replace(/\/$/, "")}${REDIRECT_PATH}?orderCode=${encodeURIComponent(orderCode)}`;
}

export function barionCallbackUrl(callbackBase: string): string {
  return `${callbackBase.replace(/\/$/, "")}${BARION_CALLBACK_PATH}`;
}

/**
 * The live Barion shop is only ever read in production; everywhere else the
 * sandbox shop is used when configured, and the in-process fake otherwise.
 */
export function barionConfigFromEnv(source: EnvSource, isProduction: boolean): BarionConfig {
  const bases = readBases(source, isProduction);

  if (isProduction) {
    const credentials = readCredentials(source, LIVE_KEYS);

    if (!credentials) {
      throw new Error(
        `Production needs the live Barion shop: set ${Object.values(LIVE_KEYS).join(", ")} in the stack's .env (see docs/adr/0021-barion-payment-integration.md)`
      );
    }

    return { mode: "live", ...credentials, ...bases };
  }

  const credentials = readCredentials(source, TEST_KEYS);

  if (!credentials) {
    return { mode: "fake", ...bases };
  }

  return { mode: "test", ...credentials, ...bases };
}

export function barionClientFor(config: BarionConfig): BarionClient {
  if (config.mode === "fake") {
    return new FakeBarionClient();
  }

  return createBarionApiClient({ mode: config.mode, posKey: config.posKey });
}

export function barionApiBaseFor(config: BarionConfig): string {
  return config.mode === "fake" ? barionApiBase("test") : barionApiBase(config.mode);
}

function readBases(
  source: EnvSource,
  isProduction: boolean
): { redirectBase: string; callbackBase: string } {
  const redirectBase = source.BARION_REDIRECT_BASE;
  const callbackBase = source.PUBLIC_API_URL;

  if (!redirectBase || !callbackBase) {
    if (isProduction) {
      throw new Error(
        "Production needs BARION_REDIRECT_BASE (the site origin) and PUBLIC_API_URL (the backend origin): the Barion gateway redirects buyers to the first and POSTs its callbacks to the second"
      );
    }

    // The fake never contacts Barion; the URLs only ride the recorded request.
    return { redirectBase: "http://localhost:4321", callbackBase: "http://localhost:4000" };
  }

  const parsedRedirect = UrlSchema.safeParse(redirectBase);
  const parsedCallback = UrlSchema.safeParse(callbackBase);

  if (!parsedRedirect.success || !parsedCallback.success) {
    throw new Error("BARION_REDIRECT_BASE and PUBLIC_API_URL must be absolute URLs");
  }

  return { redirectBase: parsedRedirect.data, callbackBase: parsedCallback.data };
}

const CredentialsSchema = z.object({
  posKey: z.string().min(8, "must be the shop's POSKey (a GUID)"),
  payeeEmail: z.email(),
});

function readCredentials(
  source: EnvSource,
  keys: typeof LIVE_KEYS | typeof TEST_KEYS
): { posKey: string; payeeEmail: string } | undefined {
  const raw = {
    posKey: source[keys.posKey],
    payeeEmail: source[keys.payeeEmail],
  };

  const present = Object.values(raw).filter((value) => value !== undefined && value !== "");

  if (present.length === 0) {
    return undefined;
  }

  const parsed = CredentialsSchema.safeParse(raw);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${keys[issue.path[0] as keyof typeof keys]}: ${issue.message}`)
      .join("; ");

    throw new Error(
      `Incomplete Barion shop in the environment (${problems}) — set both ${Object.values(keys).join(", ")} or none`
    );
  }

  return parsed.data;
}
