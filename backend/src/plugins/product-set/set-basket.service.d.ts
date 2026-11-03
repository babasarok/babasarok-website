import { TransactionalConnection } from "@vendure/core";
import type { Order, RequestContext } from "@vendure/core";
import { type SetBasketState } from "./set-basket";
export declare class SetBasketService {
    private connection;
    constructor(connection: TransactionalConnection);
    /**
     * The allocation for an order, read by the promotion and the shop API alike.
     * The order's own lines are never hydrated: that would overwrite the
     * calculator's not-yet-saved line prices with the stored ones. In-flight
     * quantities and prices are overlaid on the stored lines instead.
     */
    stateForOrder(ctx: RequestContext, order: Order): Promise<SetBasketState | undefined>;
}
