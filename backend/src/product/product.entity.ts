import { DeepPartial, VendureEntity } from "@vendure/core";
import { Column, Entity } from "typeorm";
import type { ProductDefinition as CanonicalProductDefinition } from "@babasarok/product-definition";

@Entity()
export class ProductDefinition extends VendureEntity {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor -- VendureEntity's constructor is protected; redeclaring it public is required for the plugin's `entities` array (Type<any>), and it forwards DeepPartial input to the base
  constructor(input?: DeepPartial<ProductDefinition>) {
    super(input);
  }

  /** The canonical product id (`ProductIdSchema`) — the business key. */
  @Column({ type: "varchar", unique: true })
  productId!: string;

  /** The write-time-validated canonical definition. */
  @Column({ type: "jsonb" })
  definition!: CanonicalProductDefinition;

  /** The native Vendure Product the sync generated for this definition. */
  @Column({ type: "integer", nullable: true })
  nativeProductId!: number | null;

  /** Hash of the definition state the last successful sync derived. */
  @Column({ type: "varchar", nullable: true })
  syncedDefinitionHash!: string | null;

  /** Hash of the native option-group/variant state the last sync produced. */
  @Column({ type: "varchar", nullable: true })
  syncedNativeStateHash!: string | null;

  /** The queued/failed/done state of the definition→native sync. The default
   * only exists for the migration's backfill; every write sets it explicitly. */
  @Column({ type: "varchar", default: "synced" })
  syncState!: "pending" | "synced" | "failed";

  /** Why the last sync attempt failed, for the dashboard's status display. */
  @Column({ type: "text", nullable: true })
  syncError!: string | null;
}
