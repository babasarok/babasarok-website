/**
 * Small pieces shared by the dashboard extension modules: the destructive
 * error notice, the "no filter" sentinel with its select, React row keys, and
 * the GraphQL error-code reader.
 */
import type { ReactElement } from "react";
import {
  Alert,
  AlertTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@vendure/dashboard";

export function ErrorNotice({ message }: { message: string }): ReactElement {
  return (
    <Alert variant="destructive">
      <AlertTitle className="whitespace-pre-wrap">{message}</AlertTitle>
    </Alert>
  );
}

/** The sentinel value a "no filter" option carries. */
export const ALL = "all";

export function FilterSelect({
  value,
  items,
  onChange,
}: {
  value: string;
  items: Record<string, string>;
  onChange: (value: string) => void;
}): ReactElement {
  return (
    <Select
      value={value}
      onValueChange={(next: string | null) => {
        onChange(next ?? ALL);
      }}
      items={items}
    >
      <SelectTrigger className="w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(items).map(([itemValue, label]) => (
          <SelectItem key={itemValue} value={itemValue}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function rowKey(): string {
  return crypto.randomUUID();
}

/** Reads the GraphQL error code without assuming a client error shape. */
export function errorCodeOf(err: unknown): string | undefined {
  if (!(err instanceof Error) || !("extensions" in err)) {
    return undefined;
  }

  const extensions = err.extensions;

  if (typeof extensions !== "object" || extensions === null || !("code" in extensions)) {
    return undefined;
  }

  const code = extensions.code;
  return typeof code === "string" ? code : undefined;
}
