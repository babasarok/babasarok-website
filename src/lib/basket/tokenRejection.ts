import type { Result } from "./api";
import type { Order } from "./schemas";

const REJECTION_CODES: readonly string[] = ["FORBIDDEN", "UNAUTHORIZED"];

export function isTokenRejection(status: number, errorCodes: readonly string[]): boolean {
  return (
    status === 401 || status === 403 || errorCodes.some((code) => REJECTION_CODES.includes(code))
  );
}

export interface ActiveOrderLoad {
  order: Order | null;
  loadFailed: boolean;
}

export async function loadActiveOrder(deps: {
  activeOrder: () => Promise<Result<Order | null>>;
  discardToken: () => void;
}): Promise<ActiveOrderLoad | null> {
  const result = await deps.activeOrder();

  if (result.ok) {
    return { order: result.value, loadFailed: false };
  }

  if (result.failure.tokenRejected === true) {
    deps.discardToken();

    return { order: null, loadFailed: false };
  }

  return null;
}
