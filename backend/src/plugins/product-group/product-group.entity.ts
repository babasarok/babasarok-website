import { DeepPartial, VendureEntity } from "@vendure/core";
import { Column, Entity } from "typeorm";

@Entity()
export class ProductGroup extends VendureEntity {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor -- VendureEntity's constructor is protected; redeclaring it public is required for the plugin's `entities` array (Type<any>), and it forwards DeepPartial input to the base
  constructor(input?: DeepPartial<ProductGroup>) {
    super(input);
  }

  /** The canonical group id (slug business key, e.g. `babafeszek-szett`). */
  @Column({ type: "varchar", unique: true })
  groupId!: string;

  @Column({ type: "varchar" })
  label!: string;

  /** `discounted-set` groups carry a discount; `related-items` ones are cross-sell only. */
  @Column({ type: "varchar" })
  kind!: "discounted-set" | "related-items";

  /** The flat forint amount one formed set instance removes; null for related items. */
  @Column({ type: "integer", nullable: true })
  discount!: number | null;

  /** The member products, by canonical product id. */
  @Column({ type: "jsonb" })
  productIds!: string[];
}
