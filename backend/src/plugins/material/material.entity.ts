import { Asset, DeepPartial, VendureEntity } from "@vendure/core";
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from "typeorm";

@Entity()
export class Material extends VendureEntity {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor -- VendureEntity's constructor is protected; redeclaring it public is required for the plugin's `entities` array (Type<any>), and it forwards DeepPartial input to the base
  constructor(input?: DeepPartial<Material>) {
    super(input);
  }

  /** The Tina `material_id` — the business key the canonical model references. */
  @Column({ type: "varchar", unique: true })
  slug!: string;

  @Column({ type: "varchar" })
  label!: string;

  @Column({ type: "varchar", nullable: true })
  subtitle!: string | null;

  @Column({ type: "varchar", nullable: true })
  description!: string | null;

  @ManyToOne(() => Asset, { nullable: true, eager: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "thumbnailAssetId" })
  thumbnail!: Asset | null;

  @OneToMany(() => MaterialColor, (color) => color.material, { eager: true })
  colors!: MaterialColor[];
}

@Entity()
export class MaterialColor {
  @PrimaryColumn({ type: "varchar" })
  colorId!: string;

  @Column({ type: "varchar" })
  label!: string;

  /** Exactly one of `hex` and `asset` is set, enforced by the canonical schema. */
  @Column({ type: "varchar", nullable: true })
  hex!: string | null;

  @ManyToOne(() => Asset, { nullable: true, eager: true, onDelete: "SET NULL" })
  asset!: Asset | null;

  @PrimaryColumn({ type: "integer" })
  materialId!: number;

  @ManyToOne(() => Material, (material) => material.colors, { onDelete: "CASCADE" })
  @JoinColumn({ name: "materialId" })
  material!: Material;

  @Column({ type: "integer" })
  position!: number;
}
