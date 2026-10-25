import { z } from "zod";

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().min(1),
    TOKEN_SECRET: z.string().min(16),
    API_ALLOWED_ORIGINS: z.string().min(1).optional(),
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
    if (value.NODE_ENV === "production" && !value.SMTP_HOST) {
      ctx.addIssue({
        code: "custom",
        path: ["SMTP_HOST"],
        message: "SMTP_HOST is required in production",
      });
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

export const env = {
  isProduction: value.NODE_ENV === "production",
  port: value.PORT,
  databaseUrl: value.DATABASE_URL,
  tokenSecret: value.TOKEN_SECRET,
  allowedOrigins: parseCsv(value.API_ALLOWED_ORIGINS),
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
