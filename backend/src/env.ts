import { z } from "zod";

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1),
    TOKEN_SECRET: z.string().min(16),
    API_ALLOWED_ORIGINS: z.string().min(1).optional(),
    EMAIL_TRANSPORT: z.enum(["smtp", "cloudflare"]).optional(),
    CLOUDFLARE_ACCOUNT_ID: z.string().min(1).optional(),
    CLOUDFLARE_EMAIL_TOKEN: z.string().min(1).optional(),
    SHOP_OWNER_EMAIL: z.string().min(3),
    ORDER_EMAIL_FROM: z.string().min(3),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_SECURE: z.enum(["true", "false"]).default("false"),
    SHOP_COUNTRY_CODE: z.string().length(2).default("HU"),
    SHOP_COUNTRY_NAME: z.string().min(1).default("Magyarország"),
    ADMIN_URL: z.string().min(1).default("http://localhost:4000/admin-ui"),
    SUPERADMIN_EMAIL: z.string().min(3).optional(),
    SUPERADMIN_PASSWORD: z.string().min(8).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.NODE_ENV === "production" &&
      !value.EMAIL_TRANSPORT &&
      !value.SMTP_HOST
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_TRANSPORT"],
        message: "Production requires an email transport (EMAIL_TRANSPORT or SMTP_HOST)",
      });
    }

    if (value.EMAIL_TRANSPORT === "cloudflare") {
      if (!value.CLOUDFLARE_EMAIL_TOKEN) {
        ctx.addIssue({
          code: "custom",
          path: ["CLOUDFLARE_EMAIL_TOKEN"],
          message: "CLOUDFLARE_EMAIL_TOKEN is required when EMAIL_TRANSPORT=cloudflare",
        });
      }
      if (!value.CLOUDFLARE_ACCOUNT_ID) {
        ctx.addIssue({
          code: "custom",
          path: ["CLOUDFLARE_ACCOUNT_ID"],
          message: "CLOUDFLARE_ACCOUNT_ID is required when EMAIL_TRANSPORT=cloudflare",
        });
      }
    }

    if (
      value.NODE_ENV === "production" &&
      (!value.SUPERADMIN_EMAIL || !value.SUPERADMIN_PASSWORD)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["SUPERADMIN_EMAIL"],
        message: "SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD are required in production",
      });
    }
  });

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  for (const issue of parsed.error.issues) {
    console.error(`Invalid env ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

const value = parsed.data;

function parseCsv(raw: string | undefined): string[] | undefined {
  const entries = raw
    ?.split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return entries && entries.length > 0 ? entries : undefined;
}

// The cors package only exact-matches string origins; wildcard entries
// (e.g. Cloudflare preview hosts like *-babasarok-website.x.workers.dev)
// are compiled to anchored regexes instead.
function toCorsOrigin(origin: string): string | RegExp {
  if (!origin.includes("*")) {
    return origin;
  }

  const escaped = origin.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^.]*");
  return new RegExp(`^${escaped}$`);
}

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  secure: boolean;
}

export type EmailConfig =
  | { kind: "cloudflare"; accountId: string; apiToken: string }
  | { kind: "smtp"; smtp: SmtpConfig }
  | { kind: "file" };

function emailConfig(): EmailConfig {
  if (value.EMAIL_TRANSPORT === "cloudflare") {
    if (!value.CLOUDFLARE_ACCOUNT_ID || !value.CLOUDFLARE_EMAIL_TOKEN) {
      throw new Error("EMAIL_TRANSPORT=cloudflare requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_EMAIL_TOKEN");
    }
    return {
      kind: "cloudflare",
      accountId: value.CLOUDFLARE_ACCOUNT_ID,
      apiToken: value.CLOUDFLARE_EMAIL_TOKEN,
    };
  }
  if (value.SMTP_HOST) {
    return {
      kind: "smtp",
      smtp: {
        host: value.SMTP_HOST,
        port: value.SMTP_PORT,
        user: value.SMTP_USER,
        pass: value.SMTP_PASS,
        secure: value.SMTP_SECURE === "true",
      },
    };
  }
  return { kind: "file" };
}

export const env = {
  isProduction: value.NODE_ENV === "production",
  port: value.PORT,
  databaseUrl: value.DATABASE_URL,
  tokenSecret: value.TOKEN_SECRET,
  allowedOrigins: parseCsv(value.API_ALLOWED_ORIGINS)?.map(toCorsOrigin),
  email: emailConfig(),
  shopOwnerEmail: value.SHOP_OWNER_EMAIL,
  orderEmailFrom: value.ORDER_EMAIL_FROM,
  shopCountryCode: value.SHOP_COUNTRY_CODE,
  adminUrl: value.ADMIN_URL,
  shopCountryName: value.SHOP_COUNTRY_NAME,
  smtp:
    value.SMTP_HOST === undefined
      ? undefined
      : {
          host: value.SMTP_HOST,
          port: value.SMTP_PORT,
          user: value.SMTP_USER,
          pass: value.SMTP_PASS,
          secure: value.SMTP_SECURE === "true",
        },
  superadmin: {
    email: value.SUPERADMIN_EMAIL,
    password: value.SUPERADMIN_PASSWORD,
  },
} as const;
