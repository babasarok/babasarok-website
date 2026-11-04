import { DeepPartial, VendureEntity } from "@vendure/core";
import type { ProductDefinition as CanonicalProductDefinition } from "@babasarok/product-definition";
export declare class ProductDefinition extends VendureEntity {
    constructor(input?: DeepPartial<ProductDefinition>);
    /** The canonical product id (`ProductIdSchema`) — the business key. */
    productId: string;
    /** The write-time-validated canonical definition. */
    definition: CanonicalProductDefinition;
    /** The native Vendure Product the sync generated for this definition. */
    nativeProductId: number | null;
    /** Hash of the definition state the last successful sync derived. */
    syncedDefinitionHash: string | null;
    /** Hash of the native option-group/variant state the last sync produced. */
    syncedNativeStateHash: string | null;
    /** The queued/failed/done state of the definition→native sync. The default
     * only exists for the migration's backfill; every write sets it explicitly. */
    syncState: "pending" | "synced" | "failed";
    /** Why the last sync attempt failed, for the dashboard's status display. */
    syncError: string | null;
    /** The native product's hu name, filled at read time by the service (ADR
     * 0011 decision 1: the native Product owns the name) — a projection, never
     * persisted. */
    label: string;
}
