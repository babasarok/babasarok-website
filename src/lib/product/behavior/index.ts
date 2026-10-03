import type { ProductFieldType } from "../fieldTypes";
import type { Field } from "../../types.svelte";
import type { CmsEnhancedEmbroideryColor } from "../../data";
import { inputBehavior } from "./input";
import { selectBehavior } from "./select";
import { radioBehavior } from "./radio";
import { colorBehavior } from "./color";
import { materialBehavior } from "./material";
import { toggleBehavior } from "./toggle";
import { embroideryBehavior } from "./embroidery";

/**
 * The user-entered part of a field's value, in the shape persisted to
 * localStorage. This is the core-side mirror of the `value` members of the
 * `savedField` zod union in `order/storage.ts`. The two are kept structurally
 * identical by hand (an assertion is impossible here: the ADR 0002 layering
 * rule forbids the core `product/` from importing `order/`), and a `toSaved`
 * result is guaranteed to be parseable by that schema.
 */
export type SavedFieldValue =
  | { value: string; is_custom?: boolean | undefined }
  | { value: boolean }
  | { material_id: string; colors: string[] }
  | { enabled: boolean; text: { value: string }; color: { color: string } };

export interface FieldContext {
  /**
   * The full list of fields in the product, allowing a behavior to reference
   * sibling fields or other cross-field data.
   */
  fields: Field[];
  /**
   * The shared embroidery thread palette, where a type resolves a colour id to a label.
   */
  threadColors: CmsEnhancedEmbroideryColor[] | undefined;
  /**
   * The product's banned material combinations as id multisets (`bannedCombinationIds`), precomputed by the caller because the rule spans all of the product's material fields.
   */
  banned: string[][] | undefined;
}

/** One line of the price breakdown: the label shown, and the price (Ft) the
 *  field contributes. `price` may be `undefined` for a present-but-unpriced
 *  field (rendered as "??"), distinct from the field contributing nothing at
 *  all. */
export interface FieldPricePart {
  label: string;
  price: number | undefined;
}

export interface FieldBehavior {
  /**
   * Bring the field's value into canonical form: prefill it when absent (so
   * validation and pricing always see a complete shape) and clamp it when it
   * overreaches (a material field keeps only as many colours as its
   * `color_count` allows). String-valued fields are left untouched — they
   * hold no value until the buyer acts, and validation prefill happens on
   * submit.
   */
  normalize(field: Field, ctx: Omit<FieldContext, "banned" | "threadColors">): void;

  /**
   * The scalar the field currently refers to, for cross-field references
   * (`depends_on`, `color_count`, the length source): the string value, the
   * toggle's boolean, or `undefined` when the type cannot supply one
   * (embroidery, material) or the value is absent/blank. Numeric uses parse
   * this — no field type stores a number directly.
   */
  resolveValue(field: Field): string | boolean | undefined;

  /**
   * The field's contribution to the item price, or `undefined` when it
   * contributes nothing in its current state (toggle off, embroidery
   * disabled). A present-but-unpriced field returns a part with `price:
   * undefined`. Callers exclude the length source field themselves — it
   * scales the per-meter price rather than adding to it.
   */
  price(field: Field): FieldPricePart | undefined;

  /**
   * The complete field shapes a buyer can produce for this field: one per
   * offered choice, plus a sentinel custom value where `allow_custom_value`
   * is set. The build-time 0-Ft gate composes these into every reachable
   * configuration; it applies the banned-combination pruning itself, because
   * that rule is cross-field. The field is returned with its value set
   * (otherwise unchanged).
   */
  enumerate(field: Field): Field[];

  /**
   * Fill the field from a deep-link query parameter (keyed by the field's
   * `name`). Applies the type's own option/availability rules, so a value the
   * field does not offer is handled the same way as a normal selection
   * (material: ignored; string: kept and re-judged by validation). The
   * `_color` / `_colors` companion parameters are a product-level scheme and
   * are handled by the caller.
   */
  fillFromParams(field: Field, raw: string): void;

  /** The user-entered value in its persisted (localStorage) shape, or
   *  `undefined` when the field holds none. */
  toSaved(field: Field): SavedFieldValue | undefined;

  /**
   * Check the field and record any problem on `field.value` (and the type's
   * sub-slots). Runs for every visible field before submit; hidden fields are
   * {@link FieldBehavior.clearErrors}d instead, so a stale error never blocks
   * submission.
   */
  validate(field: Field, ctx: Omit<FieldContext, "threadColors">): void;

  /** Whether the field currently carries a validation error (including the
   *  type's sub-slots, e.g. embroidery text and colour). */
  hasError(field: Field): boolean;

  /** Clear every error the type records on the value. */
  clearErrors(field: Field): void;

  /**
   * The human-readable text of the current selection — the chosen option's
   * label, "Igen" for a toggle on, the embroidery text with its resolved
   * thread colour, or the material name with its colours — or `undefined`
   * when there is nothing to show (unselected, toggle off, embroidery
   * disabled, blank). This is the value column of the basket summary; the
   * summary hides rows whose value is `undefined`.
   */
  formatValue(field: Field, ctx: Omit<FieldContext, "banned">): string | undefined;

  /**
   * Whether the submitted order email gets a line for this field: a field is
   * in the record when its current state is part of the order (a picked
   * option, a toggle explicitly on *or* off, an enabled embroidery, a picked
   * material) or it is optional free text that carries a value.
   */
  includeInEmail(field: Field): boolean;

  /**
   * The text of the field's line in the order email. For a non-empty
   * selection this is {@link FieldBehavior.formatValue}; the difference is the
   * *empty* state, which the record represents rather than hides — a toggle
   * off reads "Nem", a blank custom field reads "Egyedi: ", a blank required
   * option reads as an empty line. Only meaningful when
   * {@link FieldBehavior.includeInEmail} is true.
   */
  formatForEmail(field: Field, ctx: Omit<FieldContext, "banned">): string;
}

/** The field narrowed to one type (`Field` is a discriminated union, so the
 *  intersection reduces to that member when `T` is a literal). */
export type FieldOf<T extends ProductFieldType> = Field & { type: T };

/** A type guard for one field type, so behaviour wrappers (and modules)
 *  narrow a `Field` to `FieldOf<T>` without a cast. */
export function fieldIs<T extends ProductFieldType>(
  type: T
): (field: Field) => field is FieldOf<T> {
  return (field): field is FieldOf<T> => field.type === type;
}

/** A behaviour implementation written against its own (narrowed) field
 *  variant, before {@link defineBehavior} wraps it into the uniform
 *  {@link FieldBehavior} surface. */
type FieldBehaviorImpl<T extends ProductFieldType> = {
  [K in keyof FieldBehavior]: FieldBehavior[K] extends (
    field: Field,
    ...args: infer Args
  ) => infer R
    ? (field: FieldOf<T>, ...args: Args) => R
    : never;
};

/**
 * Wrap a per-type implementation into the uniform {@link FieldBehavior}
 * surface: every method runs only when the field is of this type. The
 * non-matching branch is unreachable — the registry routes each field to its
 * own type's behaviour — so its result is an arbitrary default. Keeping the
 * guard here (instead of in each module) lets behaviour modules work
 * exclusively with their narrowed field type.
 */
export function defineBehavior<T extends ProductFieldType>(
  type: T,
  impl: FieldBehaviorImpl<T>
): FieldBehavior {
  const is = fieldIs(type);
  return {
    normalize: (f, ctx) => {
      if (is(f)) {
        impl.normalize(f, ctx);
      }
    },
    resolveValue: (f) => (is(f) ? impl.resolveValue(f) : undefined),
    price: (f) => (is(f) ? impl.price(f) : undefined),
    enumerate: (f) => (is(f) ? impl.enumerate(f) : [f]),
    fillFromParams: (f, raw) => {
      if (is(f)) {
        impl.fillFromParams(f, raw);
      }
    },
    toSaved: (f) => (is(f) ? impl.toSaved(f) : undefined),
    validate: (f, ctx) => {
      if (is(f)) {
        impl.validate(f, ctx);
      }
    },
    hasError: (f) => (is(f) ? impl.hasError(f) : false),
    clearErrors: (f) => {
      if (is(f)) {
        impl.clearErrors(f);
      }
    },
    formatValue: (f, ctx) => (is(f) ? impl.formatValue(f, ctx) : undefined),
    includeInEmail: (f) => (is(f) ? impl.includeInEmail(f) : false),
    formatForEmail: (f, ctx) => (is(f) ? impl.formatForEmail(f, ctx) : ""),
  };
}

/**
 * The exhaustive field-type → behaviour map. The single lookup every consumer
 * uses: `FIELD_BEHAVIORS[field.type].<method>(...)`.
 */
export const FIELD_BEHAVIORS: Record<ProductFieldType, FieldBehavior> = {
  input: inputBehavior,
  select: selectBehavior,
  radio: radioBehavior,
  color: colorBehavior,
  material: materialBehavior,
  toggle: toggleBehavior,
  embroidery: embroideryBehavior,
};
