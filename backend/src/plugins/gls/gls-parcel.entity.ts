import { DeepPartial, VendureEntity, type ID } from "@vendure/core";
import { Column, Entity, Index } from "typeorm";
import type { GlsConfig } from "./gls-config";

/**
 * A parcel created in GLS for an order's fulfillment. The fulfillment's
 * native `trackingCode` is the `parcelNumber`; `parcelId` is GLS's record id
 * that deleting needs. `mode` is the GLS environment it lives in, so a
 * preview (copied from prod) never acts on a live parcel.
 */
@Entity()
export class GlsParcel extends VendureEntity {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor -- VendureEntity's constructor is protected; redeclaring it public is required for the plugin's `entities` array (Type<any>), and it forwards DeepPartial input to the base
  constructor(input?: DeepPartial<GlsParcel>) {
    super(input);
  }

  @Index()
  @Column({ type: "integer" })
  orderId!: ID;

  @Column({ type: "integer" })
  parcelId!: number;

  @Index({ unique: true })
  @Column({ type: "varchar" })
  parcelNumber!: string;

  @Column({ type: "varchar" })
  mode!: GlsConfig["mode"];

  /** The label PDF; GLS hands it out only once. Dropped when the parcel is delivered or deleted. */
  @Column({ type: "bytea", nullable: true, select: false })
  labelPdf!: Buffer | null;

  @Column({ type: "timestamp", nullable: true })
  deletedInGlsAt!: Date | null;
}
