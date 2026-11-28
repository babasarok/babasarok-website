export type DeployStack = "prod" | "preview";

const GLS_LIVE_KEYS = ["MYGLS_HU_ACCOUNT_ID", "MYGLS_HU_EMAIL", "MYGLS_HU_PASSWORD"] as const;

const GLS_TEST_KEYS = [
  "TEST_MYGLS_HU_ACCOUNT_ID",
  "TEST_MYGLS_HU_EMAIL",
  "TEST_MYGLS_HU_PASSWORD",
] as const;

const BARION_LIVE_KEYS = ["BARION_POS_KEY", "BARION_PAYEE_EMAIL"] as const;

const BARION_TEST_KEYS = ["TEST_BARION_POS_KEY", "TEST_BARION_PAYEE_EMAIL"] as const;

const CARRIED_KEYS = {
  prod: [
    "CLOUDFLARE_EMAIL_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    ...GLS_LIVE_KEYS,
    "GLS_LABEL_FORMAT",
    ...BARION_LIVE_KEYS,
  ],
  preview: [...GLS_TEST_KEYS, "GLS_LABEL_FORMAT", ...BARION_TEST_KEYS],
} as const satisfies Record<DeployStack, readonly string[]>;

const REQUIRED_KEYS = {
  prod: GLS_LIVE_KEYS,
  preview: [],
} as const satisfies Record<DeployStack, readonly string[]>;

export type RuntimeEnvFragment = { ok: true; text: string } | { ok: false; problems: string[] };

/**
 * The stack's `.env.cloudflare`: the Cloudflare build variables the stack's
 * backend reads at runtime, allowlisted per stack. Values are single-quoted
 * because docker compose interpolates `$` in unquoted and double-quoted
 * env_file values.
 *
 * The Barion URL origins are derived, never set: PUBLIC_API_URL is the API
 * origin (preview: the branch's `api-<slug>` host; prod: the existing
 * PUBLIC_VENDURE_API_URL build variable), and BARION_REDIRECT_BASE is the
 * site origin (prod: the SITE_URL build variable; preview: written by
 * deploy-backend.ts after `wrangler preview` reports the URL, into the
 * stack's .env beside ADMIN_URL).
 */
export function runtimeEnvFragment(
  stack: DeployStack,
  source: Readonly<Record<string, string | undefined>>,
  context: { slug?: string } = {}
): RuntimeEnvFragment {
  const problems: string[] = [];

  for (const key of REQUIRED_KEYS[stack]) {
    if (!source[key]) {
      problems.push(
        `${key} is missing: set it in Cloudflare → Workers Builds → Build variables (Production) — see docs/external-services.md (GLS / MyGLS)`
      );
    }
  }

  const lines: string[] = [];

  for (const key of CARRIED_KEYS[stack]) {
    const value = source[key];

    if (!value) {
      continue;
    }

    if (/['\n\r]/.test(value)) {
      problems.push(
        `${key} contains a single quote or a line break, which the env file cannot carry`
      );
      continue;
    }

    lines.push(`${key}='${value}'`);
  }

  if (stack === "preview" && context.slug) {
    lines.push(`PUBLIC_API_URL='https://api-${context.slug}.babasarok.net'`);
  }

  if (stack === "prod") {
    if (source.PUBLIC_VENDURE_API_URL) {
      lines.push(`PUBLIC_API_URL='${source.PUBLIC_VENDURE_API_URL}'`);
    }

    if (source.SITE_URL) {
      lines.push(`BARION_REDIRECT_BASE='${source.SITE_URL}'`);
    }
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return { ok: true, text: `${lines.join("\n")}\n` };
}
