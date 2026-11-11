import type { i18n as I18n } from "i18next";
import type { CheckoutMissing, Refusal, SelectionReason } from "@babasarok/pricing";
import { translateMessage } from "@/lib/i18next-client";

/** Why something failed: an i18n key, the server's own text, or one of our refusal codes. */
export type Reason = string | Refusal;

export function reasonText(i18n: I18n, reason: Reason): string {
  if (typeof reason === "string") {
    return translateMessage(i18n, reason);
  }

  return refusalText(i18n, reason);
}

function selectionReasonText(i18n: I18n, reason: SelectionReason): string {
  switch (reason.code) {
    case "UNKNOWN_MATERIAL":
      return i18n.t("refusals.reasons.UNKNOWN_MATERIAL");
    case "FOREIGN_COLOR":
      return i18n.t("refusals.reasons.FOREIGN_COLOR");
    case "TOO_FEW_COLORS":
      return i18n.t("refusals.reasons.TOO_FEW_COLORS", { required: reason.required });
    case "TEXT_TOO_LONG":
      return i18n.t("refusals.reasons.TEXT_TOO_LONG", {
        subject: i18n.t(`refusals.subjects.${reason.subject}`),
        maxLength: reason.maxLength,
      });
    case "BAD_FORMAT":
      return i18n.t("refusals.reasons.BAD_FORMAT", {
        subject: i18n.t(`refusals.subjects.${reason.subject}`),
      });
    case "UNOFFERED_VALUE":
      return i18n.t("refusals.reasons.UNOFFERED_VALUE");
    case "CUSTOM_NOT_ACCEPTED":
      return i18n.t("refusals.reasons.CUSTOM_NOT_ACCEPTED");
  }
}

function missingText(
  i18n: I18n,
  missing: readonly CheckoutMissing[],
  addressParts: readonly string[]
): string {
  const parts: string[] = missing
    .filter((item) => item !== "TERMS")
    .map((item) => i18n.t(`refusals.missing.${item}`));

  if (addressParts.length > 0) {
    parts.push(i18n.t("refusals.missing.ADDRESS", { parts: addressParts.join(", ") }));
  }

  if (missing.includes("TERMS")) {
    parts.push(i18n.t("refusals.missing.TERMS"));
  }

  return parts.join(", ");
}

export function refusalText(i18n: I18n, refusal: Refusal): string {
  switch (refusal.code) {
    case "VARIANT_UNAVAILABLE":
      return i18n.t("refusals.VARIANT_UNAVAILABLE", { productName: refusal.productName });
    case "LENGTH_MISSING":
      return i18n.t("refusals.LENGTH_MISSING", { productName: refusal.productName });
    case "UNKNOWN_FIELD":
      return i18n.t("refusals.UNKNOWN_FIELD", {
        productName: refusal.productName,
        fieldId: refusal.fieldId,
      });
    case "VALUE_NOT_OFFERED":
      return i18n.t("refusals.VALUE_NOT_OFFERED", {
        fieldLabel: refusal.fieldLabel,
        value: refusal.value,
      });
    case "MATERIAL_NOT_OFFERED":
      return i18n.t("refusals.MATERIAL_NOT_OFFERED", {
        fieldLabel: refusal.fieldLabel,
        materialId: refusal.materialId,
      });
    case "FIELD_HAS_NO_OPTIONS":
      return i18n.t("refusals.FIELD_HAS_NO_OPTIONS", { fieldLabel: refusal.fieldLabel });
    case "FORBIDDEN_COMBINATION":
      return i18n.t("refusals.FORBIDDEN_COMBINATION", {
        productName: refusal.productName,
        materialIds: refusal.materialIds.join(", "),
      });
    case "SELECTION_WRONG_KIND":
      return i18n.t("refusals.SELECTION_WRONG_KIND", {
        productName: refusal.productName,
        fieldLabel: refusal.fieldLabel,
      });
    case "SELECTION_INVALID":
      return i18n.t("refusals.SELECTION_INVALID", {
        productName: refusal.productName,
        fieldLabel: refusal.fieldLabel,
        reason: selectionReasonText(i18n, refusal.reason),
      });
    case "SELECTIONS_NOT_JSON":
      return i18n.t("refusals.SELECTIONS_NOT_JSON");
    case "SELECTIONS_INVALID":
      return i18n.t("refusals.SELECTIONS_INVALID", { issues: refusal.issues.join(", ") });
    case "UNKNOWN_THREAD_COLOR":
      return i18n.t("refusals.UNKNOWN_THREAD_COLOR", { colorIds: refusal.colorIds.join(", ") });
    case "CHECKOUT_INCOMPLETE":
      return i18n.t("refusals.CHECKOUT_INCOMPLETE", {
        missing: missingText(
          i18n,
          refusal.missing,
          refusal.addressParts.map((part) => i18n.t(`refusals.addressParts.${part}`))
        ),
      });
  }
}
