/**
 * Small pieces shared by the dashboard extension modules: the destructive
 * error notice, React row keys, and the GraphQL error-code reader.
 */
import type { ReactElement } from "react";
import { Alert, AlertTitle } from "@vendure/dashboard";

export function ErrorNotice({ message }: { message: string }): ReactElement {
  return (
    <Alert variant="destructive">
      <AlertTitle className="whitespace-pre-wrap">{message}</AlertTitle>
    </Alert>
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
