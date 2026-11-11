import type { BasketApi, Result } from "./api";
import {
  billingPlan,
  customerInput,
  hasBillingAddress,
  hasShippingAddress,
  recipientOf,
  shippingAddressInput,
  valuesFromOrder,
  type AddressValues,
  type BillingValues,
  type ContactValues,
} from "./checkoutValues";
import { requiresAddress, type Order, type ShippingQuote } from "./schemas";

export type SaveApi = Pick<
  BasketApi,
  | "setCustomer"
  | "setShippingAddress"
  | "setBillingAddress"
  | "unsetBillingAddress"
  | "setShippingMethod"
  | "setOrderCustomFields"
>;

/** The live order the saves read and replace — the basket store in the site. */
export interface OrderPort {
  order(): Order | null;
  apply(result: Result<Order>): Result<Order>;
}

export interface CheckoutSaves {
  contact(contact: ContactValues): Promise<void>;
  shipping(address: AddressValues): Promise<void>;
  billing(billing: BillingValues, method: ShippingQuote | undefined): Promise<void>;
  method(shippingMethodId: string): Promise<void>;
  message(message: string): Promise<void>;
  /** Resolves once every queued save has settled. */
  settled(): Promise<void>;
}

/**
 * Saves checkout steps onto the active order one at a time, so each save
 * reads the order the previous one returned. A failed save leaves the order
 * as it was and never rejects: submission re-sends every field.
 */
export function createCheckoutSaves(api: SaveApi, port: OrderPort): CheckoutSaves {
  let queue: Promise<void> = Promise.resolve();

  function enqueue(task: (order: Order) => Promise<void>): Promise<void> {
    queue = queue.then(async () => {
      const order = port.order();

      if (order === null) {
        return;
      }

      await task(order);
    });

    return queue;
  }

  async function apply(call: Promise<Result<Order>>): Promise<boolean> {
    return port.apply(await call).ok;
  }

  return {
    contact: (contact) =>
      enqueue(async () => {
        await apply(api.setCustomer(customerInput(contact)));
      }),
    shipping: (address) =>
      enqueue(async (order) => {
        const values = valuesFromOrder(order);
        const company = order.shippingAddress?.company ?? "";

        await apply(
          api.setShippingAddress(
            shippingAddressInput(address, recipientOf(values.contact), company)
          )
        );
      }),
    billing: (billing, method) =>
      enqueue(async (order) => {
        const plan = billingPlan(billing, method);

        if (plan.billingAddress !== null) {
          await apply(api.setBillingAddress(plan.billingAddress));
        } else if (hasBillingAddress(order)) {
          await apply(api.unsetBillingAddress());
        }

        const current = port.order() ?? order;
        const storedCompany = current.shippingAddress?.company ?? "";

        if (
          requiresAddress(method) &&
          hasShippingAddress(current) &&
          storedCompany !== plan.shippingCompany
        ) {
          const values = valuesFromOrder(current);

          await apply(
            api.setShippingAddress(
              shippingAddressInput(values.address, recipientOf(values.contact), plan.shippingCompany)
            )
          );
        }

        await apply(api.setOrderCustomFields({ taxNumber: billing.taxNumber }));
      }),
    method: (shippingMethodId) =>
      enqueue(async () => {
        await apply(api.setShippingMethod(shippingMethodId));
      }),
    message: (message) =>
      enqueue(async () => {
        await apply(api.setOrderCustomFields({ message }));
      }),
    settled: () => queue,
  };
}
