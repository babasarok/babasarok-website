import { z } from "zod";
import { FakeGlsClient } from "./fake-gls-client";
import type { GlsClient } from "./gls-client";
import {
  createMyGlsClient,
  LABEL_FORMATS,
  type LabelFormat,
  type MyGlsCredentials,
  type MyGlsEnvironment,
} from "./mygls-client";

export type GlsConfig =
  | { mode: "fake"; labelFormat: LabelFormat }
  | { mode: MyGlsEnvironment; credentials: MyGlsCredentials; labelFormat: LabelFormat };

type EnvSource = Readonly<Record<string, string | undefined>>;

const LIVE_KEYS = {
  accountId: "MYGLS_HU_ACCOUNT_ID",
  email: "MYGLS_HU_EMAIL",
  password: "MYGLS_HU_PASSWORD",
} as const;

const TEST_KEYS = {
  accountId: "TEST_MYGLS_HU_ACCOUNT_ID",
  email: "TEST_MYGLS_HU_EMAIL",
  password: "TEST_MYGLS_HU_PASSWORD",
} as const;

type CredentialKeys = typeof LIVE_KEYS | typeof TEST_KEYS;

const CredentialsSchema = z.object({
  accountId: z.string().regex(/^\d+$/, "must be the numeric GLS client number"),
  email: z.string().min(3),
  password: z.string().min(1),
});

const LabelFormatSchema = z.enum(LABEL_FORMATS).default("A4_2x2");

/**
 * The live GLS account is only ever read in production; everywhere else the
 * test-environment account is used when configured, and the in-process fake
 * otherwise.
 */
export function glsConfigFromEnv(source: EnvSource, isProduction: boolean): GlsConfig {
  const labelFormat = parseLabelFormat(source);

  if (isProduction) {
    const credentials = readCredentials(source, LIVE_KEYS);

    if (!credentials) {
      throw new Error(
        `Production needs the live GLS account: set ${Object.values(LIVE_KEYS).join(", ")} in the stack's .env (see docs/adr/0020-gls-labels-via-mygls-api.md)`
      );
    }

    return { mode: "live", credentials, labelFormat };
  }

  const credentials = readCredentials(source, TEST_KEYS);

  if (!credentials) {
    return { mode: "fake", labelFormat };
  }

  return { mode: "test", credentials, labelFormat };
}

export function glsClientFor(config: GlsConfig): GlsClient {
  if (config.mode === "fake") {
    return new FakeGlsClient();
  }

  return createMyGlsClient({
    environment: config.mode,
    country: "HU",
    credentials: config.credentials,
    labelFormat: config.labelFormat,
  });
}

function readCredentials(source: EnvSource, keys: CredentialKeys): MyGlsCredentials | undefined {
  const raw = {
    accountId: source[keys.accountId],
    email: source[keys.email],
    password: source[keys.password],
  };

  const present = Object.values(raw).filter((value) => value !== undefined && value !== "");

  if (present.length === 0) {
    return undefined;
  }

  const parsed = CredentialsSchema.safeParse(raw);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${keyName(keys, issue.path[0])}: ${issue.message}`)
      .join("; ");

    throw new Error(
      `Incomplete GLS account in the environment (${problems}) — set all of ${Object.values(keys).join(", ")} or none`
    );
  }

  return {
    username: parsed.data.email,
    password: parsed.data.password,
    clientNumber: Number(parsed.data.accountId),
  };
}

function keyName(keys: CredentialKeys, field: PropertyKey | undefined): string {
  if (field === "accountId" || field === "email" || field === "password") {
    return keys[field];
  }

  return String(field);
}

function parseLabelFormat(source: EnvSource): LabelFormat {
  const parsed = LabelFormatSchema.safeParse(source.GLS_LABEL_FORMAT || undefined);

  if (!parsed.success) {
    throw new Error(`GLS_LABEL_FORMAT must be one of ${LABEL_FORMATS.join(", ")}`);
  }

  return parsed.data;
}
