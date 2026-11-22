export type DeployStack = "prod" | "preview";

const GLS_LIVE_KEYS = ["MYGLS_HU_ACCOUNT_ID", "MYGLS_HU_EMAIL", "MYGLS_HU_PASSWORD"] as const;

const GLS_TEST_KEYS = [
  "TEST_MYGLS_HU_ACCOUNT_ID",
  "TEST_MYGLS_HU_EMAIL",
  "TEST_MYGLS_HU_PASSWORD",
] as const;

const CARRIED_KEYS = {
  prod: ["CLOUDFLARE_EMAIL_TOKEN", "CLOUDFLARE_ACCOUNT_ID", ...GLS_LIVE_KEYS, "GLS_LABEL_FORMAT"],
  preview: [...GLS_TEST_KEYS, "GLS_LABEL_FORMAT"],
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
 */
export function runtimeEnvFragment(
  stack: DeployStack,
  source: Readonly<Record<string, string | undefined>>
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

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return { ok: true, text: `${lines.join("\n")}\n` };
}
