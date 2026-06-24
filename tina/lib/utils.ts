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
export function getValue(props: ComponentProps, path: string): any {
  const castedProps = props as unknown as InputFieldType<
    object,
    Parameters<typeof ReferenceField>[0]
  >;
  const form = castedProps.form;
  const selPath = props.field.name.split(".").slice(0, -1).join(".");

  const fullPath = path.split("/").reduce((acc, part) => {
    if (part === "..") {
      return acc.split(".").slice(0, -1).join(".");
    } else {
      return acc ? `${acc}.${part}` : part;
    }
  }, selPath);

  return fullPath
    .split(".")
    .reduce((obj: any, key: any) => obj && obj[key], form.getState().values);
}
