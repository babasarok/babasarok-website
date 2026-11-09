import { DeepPartial, VendureEntity } from "@vendure/core";
import { Column, Entity, Index } from "typeorm";

@Entity()
@Index(["createdAt"])
export class AuditLogEntry extends VendureEntity {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor -- VendureEntity's constructor is protected; redeclaring it public is required for the plugin's `entities` array (Type<any>), and it forwards DeepPartial input to the base
  constructor(input?: DeepPartial<AuditLogEntry>) {
    super(input);
  }

  @Column({ type: "integer", nullable: true })
  actorUserId!: number | null;

  /** The login (email) of the acting admin, denormalized for the list view. */
  @Column({ type: "varchar", nullable: true })
  actorIdentifier!: string | null;

  @Column({ type: "varchar" })
  entityType!: string;

  @Column({ type: "varchar" })
  entityKey!: string;

  @Column({ type: "varchar" })
  action!: string;

  @Column({ type: "varchar", nullable: true })
  summary!: string | null;

  @Column({ type: "varchar" })
  source!: string;
}
