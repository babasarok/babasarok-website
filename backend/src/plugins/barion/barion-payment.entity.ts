import { DeepPartial, VendureEntity, type ID } from "@vendure/core";
import { Column, Entity, Index } from "typeorm";
import type { BarionStatus } from "./barion-payment-items";

/**
 * One Barion gateway payment for an order: the `paymentId` is Barion's GUID
 * (also the recorded Vendure Payment's transactionId). `status` is our own
 * verdict (barionStatusDecision), not Barion's raw state. `amount`/`currency`
 * are what the gateway was asked to charge, in the order's stored minor units.
 * `sessionId` is the shop session that created the intent — the status poll
 * answers only to it (or to the order's own registered buyer).
 */
@Entity()
export class BarionPayment extends VendureEntity {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor -- VendureEntity's constructor is protected; redeclaring it public is required for the plugin's `entities` array (Type<any>), and it forwards DeepPartial input to the base
  constructor(input?: DeepPartial<BarionPayment>) {
    super(input);
  }

  @Index({ unique: true })
  @Column({ type: "varchar" })
  paymentId!: string;

  @Index()
  @Column({ type: "integer" })
  orderId!: ID;

  @Column({ type: "varchar" })
  orderCode!: string;

  @Column({ type: "varchar" })
  sessionId!: string;

  @Column({ type: "varchar" })
  status!: BarionStatus;

  @Column({ type: "varchar" })
  role!: string;

  @Column({ type: "integer" })
  amount!: number;

  @Column({ type: "varchar" })
  currencyCode!: string;
}
