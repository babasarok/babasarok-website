import type { InputFieldType, ReferenceField } from "tinacms";

/**
 *
 * @param obj full component props
 * @param path path relative to selPath, can traverse up with ../
 */
export function getValue(props: InputFieldType<{}, Parameters<typeof ReferenceField>[0]>, path: string): any {
    const form = props.form;
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
