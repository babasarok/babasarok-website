import { z } from "zod";

/**
 * A buyer's selections on an order line, stored on the line's `selections`
 * custom field as JSON. One record per field the buyer acted on, keyed by the
 * canonical field id. Fields that ride on the variant (non-color choices,
 * toggles, material picks) are recorded too, so the line carries the complete
 * configuration — but only their colors live nowhere else: the material pick
 * itself is also a variant option.
 */
const InputSelectionSchema = z.strictObject({
  kind: z.literal("input"),
  value: z.string(),
});

const OptionSelectionSchema = z.strictObject({
  kind: z.literal("option"),
  value: z.string(),
});

const CustomSelectionSchema = z.strictObject({
  kind: z.literal("custom"),
  value: z.string(),
});

const MaterialSelectionSchema = z.strictObject({
  kind: z.literal("material"),
  materialId: z.string(),
  colors: z.array(z.string()),
});

const EmbroiderySelectionSchema = z.strictObject({
  kind: z.literal("embroidery"),
  text: z.string(),
  colorId: z.string(),
});

export const LineSelectionRecordSchema = z.discriminatedUnion("kind", [
  InputSelectionSchema,
  OptionSelectionSchema,
  CustomSelectionSchema,
  MaterialSelectionSchema,
  EmbroiderySelectionSchema,
]);

export const LineSelectionsSchema = z.record(z.string(), LineSelectionRecordSchema);

export type LineSelectionRecord = z.output<typeof LineSelectionRecordSchema>;
/** Missing key = the buyer acted on no such field (record indexes stay optional). */
export type LineSelections = Partial<Record<string, LineSelectionRecord>>;

export class LineSelectionsError extends Error {}

/**
 * Parses the raw `selections` custom-field value (JSON or null/empty for an
 * unconfigured line) into the typed records, or throws {@link LineSelectionsError}.
 */
export function parseLineSelections(raw: unknown): LineSelections {
  if (typeof raw !== "string" || raw.trim() === "") {
    return {};
  }

  let data: unknown;

  try {
    data = JSON.parse(raw);
  } catch {
    throw new LineSelectionsError("A rendelési sor konfigurációja nem érvényes JSON.");
  }

  const parsed = LineSelectionsSchema.safeParse(data);

  if (!parsed.success) {
    throw new LineSelectionsError(
      `A rendelési sor konfigurációja érvénytelen: ${parsed.error.issues
        .map((issue) => issue.path.join("..ts"))
        .join(", ")}`
    );
  }

  return parsed.data;
}

export function serializeLineSelections(selections: LineSelections): string {
  return JSON.stringify(selections);
}
