export interface ClientErrorReport {
  /** "order" marks a failed order submission, which also emails the operator. */
  kind: "order" | "uncaught";
  message: string;
  stack?: string | undefined;
  reference?: string;
}

/** Fire-and-forget to the site's own origin, which stays reachable when the API host is not. */
export function reportClientError(report: ClientErrorReport): void {
  const body = JSON.stringify({
    ...report,
    url: globalThis.location.href,
    userAgent: navigator.userAgent,
  });

  try {
    if (navigator.sendBeacon("/client-errors", body)) {
      return;
    }

    void fetch("/client-errors", { method: "POST", body, keepalive: true }).catch(() => {});
  } catch {
    // Reporting must never break the page.
  }
}

export function errorDetails(error: unknown): { message: string; stack?: string | undefined } {
  if (error instanceof Error) {
    return { message: `${error.name}: ${error.message}`, stack: error.stack };
  }

  return { message: String(error) };
}
