import type { InputFieldType, ReferenceField, TinaField } from "tinacms";

type ComponentProps = Parameters<Exclude<NonNullable<NonNullable<TinaField["ui"]>["component"]>, string>>[0];
/**
 *
 * @param obj full component props
 * @param path path relative to selPath, can traverse up with ../
 */
export function getValue(props: ComponentProps, path: string): any {
    const castedProps = props as unknown as InputFieldType<{}, Parameters<typeof ReferenceField>[0]>;
    const form = castedProps.form;
    const selPath = props.field.name.split(".").slice(0, -1).join(".");

    const fullPath = path.split("/").reduce((acc, part) => {
        if (part === "..") {
            return acc.split(".").slice(0, -1).join(".");
        } else {
            return acc ? `${acc}.${part}` : part;
        }
    }, selPath);

    return fullPath.split(".").reduce((obj, key) => obj && obj[key], form.getState().values);
}
