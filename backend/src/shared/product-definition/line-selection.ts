import { z } from "zod";
import { RefusalError } from "../refusal";

/**
 * A buyer's selections on an order line, stored on the line's `selections`
 * custom field as JSON. One record per field the buyer acted on, keyed by the
 * canonical field id. The records are the line's complete configuration:
 * pricing, set discounts and line validity read them, never the variant.
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

export class LineSelectionsError extends RefusalError {}

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
    throw new LineSelectionsError({ code: "SELECTIONS_NOT_JSON" });
  }

  const parsed = LineSelectionsSchema.safeParse(data);

  if (!parsed.success) {
    throw new LineSelectionsError({
      code: "SELECTIONS_INVALID",
      issues: parsed.error.issues.map((issue) => issue.path.join(".")),
    });
  }

  return parsed.data;
}

export function serializeLineSelections(selections: LineSelections): string {
  return JSON.stringify(selections);
}
