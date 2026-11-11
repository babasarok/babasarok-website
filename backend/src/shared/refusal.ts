import { z } from "zod";

/**
 * Why the server refuses a line or an order, as a code with the values the
 * site needs to explain it (ADR 0015 decision 5). The site owns the wording:
 * it renders each code from its locale files. Names and labels inside are in
 * the request's language.
 */
const ValueSubjectSchema = z.enum(["text", "value"]);

export const SelectionReasonSchema = z.discriminatedUnion("code", [
  z.strictObject({ code: z.literal("UNKNOWN_MATERIAL") }),
  z.strictObject({ code: z.literal("FOREIGN_COLOR") }),
  z.strictObject({ code: z.literal("TOO_FEW_COLORS"), required: z.number().int() }),
  z.strictObject({
    code: z.literal("TEXT_TOO_LONG"),
    subject: ValueSubjectSchema,
    maxLength: z.number().int(),
  }),
  z.strictObject({ code: z.literal("BAD_FORMAT"), subject: ValueSubjectSchema }),
  z.strictObject({ code: z.literal("UNOFFERED_VALUE") }),
  z.strictObject({ code: z.literal("CUSTOM_NOT_ACCEPTED") }),
]);

export const CheckoutMissingSchema = z.enum(["LINE", "CUSTOMER", "SHIPPING_METHOD", "TERMS"]);

export const AddressPartSchema = z.enum(["STREET", "HOUSE_NUMBER", "POSTAL_CODE", "CITY"]);

export const RefusalSchema = z.discriminatedUnion("code", [
  z.strictObject({ code: z.literal("VARIANT_UNAVAILABLE"), productName: z.string() }),
  z.strictObject({ code: z.literal("LENGTH_MISSING"), productName: z.string() }),
  z.strictObject({
    code: z.literal("UNKNOWN_FIELD"),
    productName: z.string(),
    fieldId: z.string(),
  }),
  z.strictObject({
    code: z.literal("VALUE_NOT_OFFERED"),
    productName: z.string(),
    fieldLabel: z.string(),
    value: z.string(),
  }),
  z.strictObject({
    code: z.literal("MATERIAL_NOT_OFFERED"),
    productName: z.string(),
    fieldLabel: z.string(),
    materialId: z.string(),
  }),
  z.strictObject({
    code: z.literal("FIELD_HAS_NO_OPTIONS"),
    productName: z.string(),
    fieldLabel: z.string(),
  }),
  z.strictObject({
    code: z.literal("FORBIDDEN_COMBINATION"),
    productName: z.string(),
    materialIds: z.array(z.string()),
  }),
  z.strictObject({
    code: z.literal("SELECTION_WRONG_KIND"),
    productName: z.string(),
    fieldLabel: z.string(),
  }),
  z.strictObject({
    code: z.literal("SELECTION_INVALID"),
    productName: z.string(),
    fieldLabel: z.string(),
    reason: SelectionReasonSchema,
  }),
  z.strictObject({ code: z.literal("SELECTIONS_NOT_JSON") }),
  z.strictObject({ code: z.literal("SELECTIONS_INVALID"), issues: z.array(z.string()) }),
  z.strictObject({ code: z.literal("UNKNOWN_THREAD_COLOR"), colorIds: z.array(z.string()) }),
  z.strictObject({
    code: z.literal("CHECKOUT_INCOMPLETE"),
    missing: z.array(CheckoutMissingSchema),
    addressParts: z.array(AddressPartSchema),
  }),
]);

export type SelectionReason = z.output<typeof SelectionReasonSchema>;
export type CheckoutMissing = z.output<typeof CheckoutMissingSchema>;
export type AddressPart = z.output<typeof AddressPartSchema>;
export type Refusal = z.output<typeof RefusalSchema>;
export type RefusalCode = Refusal["code"];

/** Vendure carries interceptor and transition refusals as strings: the refusal travels as JSON. */
export function encodeRefusal(refusal: Refusal): string {
  return JSON.stringify(refusal);
}

/** The refusal a server error string carries, or undefined when it is plain text. */
export function decodeRefusal(raw: string): Refusal | undefined {
  let data: unknown;

  try {
    data = JSON.parse(raw);
  } catch {
    return undefined;
  }

  const parsed = RefusalSchema.safeParse(data);

  return parsed.success ? parsed.data : undefined;
}

/** A thrown refusal, for code paths that unwind (pricing, selection parsing). */
export class RefusalError extends Error {
  constructor(readonly refusal: Refusal) {
    super(encodeRefusal(refusal));
  }
}
