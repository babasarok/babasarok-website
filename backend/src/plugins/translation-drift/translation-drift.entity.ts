import { DeepPartial, VendureEntity } from "@vendure/core";
import { Column, Entity, Unique } from "typeorm";

@Entity()
@Unique(["entityType", "entityKey", "field", "languageCode"])
export class TranslationDriftDismissal extends VendureEntity {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor -- VendureEntity's constructor is protected; redeclaring it public is required for the plugin's `entities` array (Type<any>), and it forwards DeepPartial input to the base
  constructor(input?: DeepPartial<TranslationDriftDismissal>) {
    super(input);
  }

  @Column({ type: "varchar" })
  entityType!: string;

  @Column({ type: "varchar" })
  entityKey!: string;

  @Column({ type: "varchar" })
  field!: string;

  @Column({ type: "varchar" })
  languageCode!: string;

  /** The audit entry the dismissed warning was based on: a newer Hungarian
   * change to the same field re-raises the warning. */
  @Column({ type: "integer" })
  auditEntryId!: number;

  /** The login (email) of the dismissing admin, for the record. */
  @Column({ type: "varchar", nullable: true })
  actorIdentifier!: string | null;
}
