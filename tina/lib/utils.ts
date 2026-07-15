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

/** Minimal shape of a Tina field needed to derive `required` children. */
interface RequiredFieldSpec {
  name: string;
  label?: string;
  required?: boolean | null;
}

function isBlank(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  );
}

/**
 * Build a `ui.validate` function for an `object` list field that blocks saving
 * when any item is missing its `required` child fields.
 *
 * Tina uses react-final-form, which only validates fields that are currently
 * mounted. A list item the editor adds but never expands never mounts its child
 * fields, so their `required: true` never runs and the item saves as an empty
 * object. The parent list field IS mounted, so validating the whole array here
 * catches those empty/partial items on save.
 */
export function validateRequiredListItems(
  fields: readonly RequiredFieldSpec[],
): (value: unknown) => string | undefined {
  const required = fields.filter((field) => field.required);

  return (value) => {
    if (!Array.isArray(value)) {
      return;
    }

    for (const [index, item] of value.entries()) {
      const record = (item ?? {}) as Record<string, unknown>;
      const missing = required.filter((field) => isBlank(record[field.name]));

      if (missing.length > 0) {
        const labels = missing.map((field) => field.label ?? field.name).join(", ");
        return `A(z) ${index + 1}. elem kötelező mezői hiányoznak: ${labels}`;
      }
    }

    return;
  };
}
