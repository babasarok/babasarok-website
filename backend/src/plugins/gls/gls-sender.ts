import { LanguageCode, type CustomFieldConfig } from "@vendure/core";
import { z } from "zod";
import type { GlsAddress } from "./gls-client";

function hu(value: string): { languageCode: LanguageCode; value: string }[] {
  return [{ languageCode: LanguageCode.hu, value }];
}

export const GLS_SENDER_FIELD = {
  name: "glsSender",
  type: "struct",
  nullable: true,
  label: hu("GLS feladó (a címkén)"),
  description: hu(
    "A GLS-címkén feladóként szereplő cím és elérhetőség — innen viszi el a futár a csomagot."
  ),
  fields: [
    { name: "name", type: "string", label: hu("Név") },
    { name: "street", type: "string", label: hu("Utca") },
    { name: "houseNumber", type: "string", label: hu("Házszám") },
    { name: "city", type: "string", label: hu("Település") },
    { name: "zipCode", type: "string", label: hu("Irányítószám") },
    { name: "countryCode", type: "string", label: hu("Országkód (pl. HU)") },
    { name: "phone", type: "string", label: hu("Telefonszám") },
    { name: "email", type: "string", label: hu("E-mail-cím") },
  ],
} satisfies CustomFieldConfig;

const filled = z.string().trim().min(1);

const SenderSchema = z.object({
  name: filled,
  street: filled,
  houseNumber: filled,
  city: filled,
  zipCode: filled,
  countryCode: filled.length(2),
  phone: filled,
  email: z.string().trim().optional(),
});

const SENDER_LABELS: Record<keyof z.input<typeof SenderSchema>, string> = {
  name: "név",
  street: "utca",
  houseNumber: "házszám",
  city: "település",
  zipCode: "irányítószám",
  countryCode: "országkód (2 betű)",
  phone: "telefonszám",
  email: "e-mail-cím",
};

type SenderKey = keyof typeof SENDER_LABELS;

function isSenderKey(key: PropertyKey | undefined): key is SenderKey {
  return typeof key === "string" && Object.hasOwn(SENDER_LABELS, key);
}

export type SenderResult = { ok: true; address: GlsAddress } | { ok: false; reason: string };

export function glsSenderAddress(stored: unknown): SenderResult {
  const parsed = SenderSchema.safeParse(stored ?? {});

  if (!parsed.success) {
    const missing = [
      ...new Set(
        parsed.error.issues.map((issue) => {
          const key = issue.path[0];

          if (isSenderKey(key)) {
            return SENDER_LABELS[key];
          }

          return String(key);
        })
      ),
    ];

    return {
      ok: false,
      reason: `Hiányos a GLS feladó címe (${missing.join(", ")}): töltsd ki a csatorna beállításainál (Settings → Channels → „GLS feladó”).`,
    };
  }

  const sender = parsed.data;

  return {
    ok: true,
    address: {
      name: sender.name,
      street: sender.street,
      houseNumber: sender.houseNumber,
      city: sender.city,
      zipCode: sender.zipCode,
      countryCode: sender.countryCode.toUpperCase(),
      contactName: sender.name,
      contactPhone: sender.phone,
      contactEmail: sender.email || undefined,
    },
  };
}
