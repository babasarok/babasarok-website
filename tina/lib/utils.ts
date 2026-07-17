import type { InputFieldType, ReferenceField, TinaField } from "tinacms";

type ComponentProps = Parameters<
  Exclude<NonNullable<NonNullable<TinaField["ui"]>["component"]>, string>
>[0];

/**
 * Read a sibling/relative field value from inside a Tina `ui.component`
 * callback. `path` is relative to the current field and may traverse up with
 * `../`. Ported from the old Hugo project's product configurator so the
 * conditional field UI keeps working.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getValue(props: ComponentProps, path: string): any {
  const castedProps = props as unknown as InputFieldType<
    object,
    Parameters<typeof ReferenceField>[0]
  >;
  const form = castedProps.form;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const selPath = props.field.name.split(".").slice(0, -1).join(".");

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const fullPath = path.split("/").reduce((acc, part) => {
    if (part === "..") {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      return acc.split(".").slice(0, -1).join(".");
    } else {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      return acc ? `${acc}.${part}` : part;
    }
  }, selPath);

  return (
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    fullPath
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      .split(".")
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
      .reduce((obj: any, key: any) => obj && obj[key], form.getState().values)
  );
}

export function slugify(value: string): string {
  return value
    .normalize("NFKD") // split accents from letters (á -> a +  ́)
    .replaceAll(/[\u0300-\u036F]/g, "") // drop the accent marks
    .replaceAll(/[^a-zA-Z0-9]+/g, "-") // non-ascii/alnum -> dash
    .replaceAll(/^-+|-+$/g, "") // trim dashes
    .toLowerCase();
}

/** Minimal shape of a Tina field needed to walk list items for required children. */
interface FieldLike {
  name: string;
  label?: string | boolean;
  list?: boolean | null;
  required?: boolean | null;
  fields?: readonly FieldLike[];
}

function isBlank(value: unknown): boolean {
  return (
    value === undefined || value === null || (typeof value === "string" && value.trim() === "")
  );
}

function fieldLabel(field: FieldLike): string {
  return typeof field.label === "string" ? field.label : field.name;
}

/**
 * Recursively collect the labels of blank `required` fields that live INSIDE a
 * list item. Only reports once `insideList` is true, so top-level (mounted)
 * required fields — which Tina already validates and which may be conditionally
 * hidden — are left alone.
 */
function collectMissingListRequired(
  fields: readonly FieldLike[],
  value: unknown,
  path: string,
  insideList: boolean,
  errors: string[]
): void {
  const record = (value ?? {}) as Record<string, unknown>;

  for (const field of fields) {
    const fieldValue = record[field.name];
    const label = fieldLabel(field);
    const here = path ? `${path} → ${label}` : label;

    if (insideList && field.required && isBlank(fieldValue)) {
      errors.push(here);
    }

    if (!field.fields) {
      continue;
    }

    if (field.list) {
      if (Array.isArray(fieldValue)) {
        for (const [index, item] of fieldValue.entries()) {
          collectMissingListRequired(
            field.fields ?? [],
            item,
            `${label} #${index + 1}`,
            true,
            errors
          );
        }
      }
    } else if (fieldValue && typeof fieldValue === "object") {
      collectMissingListRequired(field.fields ?? [], fieldValue, here, insideList, errors);
    }
  }
}

/**
 * Collection `ui.beforeSubmit` guard that blocks the SAVE (by throwing) when any
 * list item — including ones the editor added but never expanded — is missing a
 * required child field.
 *
 * Why not a field `ui.validate`? Tina uses react-final-form, which only
 * validates MOUNTED fields, so an unexpanded new list item saves as an empty
 * object. A list-level `ui.validate` does catch it, but it marks the form
 * continuously invalid, which makes Tina refuse to navigate INTO the new item
 * ("Cannot navigate away from an invalid form") — a dead end. `beforeSubmit`
 * runs only at save time, so it gates the write without blocking navigation.
 *
 * A thrown error is swallowed by Tina into a `FORM_ERROR` that only logs to the
 * console, so we surface the message ourselves via `cms.alerts.error` first,
 * then throw to actually abort the save.
 */
export async function requiredListItemsBeforeSubmit({
  cms,
  form,
  values,
}: {
  cms: { alerts: { error: (message: string, timeout?: number) => void } };
  form: { fields?: readonly FieldLike[] };
  values: Record<string, unknown>;
}): Promise<void> {
  const errors: string[] = [];
  collectMissingListRequired(form.fields ?? [], values, "", false, errors);

  if (errors.length > 0) {
    const message = `Nem menthető – hiányzó kötelező mezők:\n• ${errors.join("\n• ")}`;
    cms.alerts.error(message);
    throw new Error(message);
  }
}
