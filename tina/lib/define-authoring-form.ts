import type { TinaField } from "tinacms";
import type { z } from "zod";

type KeysOfUnion<T> = T extends T ? keyof T : never;
type CanonicalProperty<TSchema extends z.ZodType> = Extract<KeysOfUnion<z.output<TSchema>>, string>;

type AuthoringField<TSchema extends z.ZodType> = {
  meaning:
    | {
        kind: "canonical";
        property:
          | CanonicalProperty<TSchema>
          | readonly [CanonicalProperty<TSchema>, ...CanonicalProperty<TSchema>[]];
      }
    | {
        kind: "presentation";
      };
  field: TinaField;
};

/**
 * Pair a canonical Zod definition with the Tina fields used to author it.
 *
 * This deliberately does not inspect the Zod schema. Tina labels, controls and
 * source names are authoring-adapter facts, while `property` keeps every
 * commerce field tied to a real canonical property at compile time.
 */
export function defineAuthoringForm<TSchema extends z.ZodType>({
  schema,
  fields,
}: {
  schema: TSchema;
  fields: readonly AuthoringField<TSchema>[];
}): { schema: TSchema; fields: TinaField[] } {
  return {
    schema,
    fields: fields.map(({ field }) => field),
  };
}
