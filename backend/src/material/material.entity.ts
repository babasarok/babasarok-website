import { Asset } from "@vendure/core";
import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryColumn } from "typeorm";

@Entity()
export class Material {
  /** The material code from the canonical model (`MaterialId`). */
  @PrimaryColumn({ type: "varchar" })
  id!: string;

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

  @PrimaryColumn({ type: "varchar" })
  materialId!: string;

  @ManyToOne(() => Material, (material) => material.colors, { onDelete: "CASCADE" })
  @JoinColumn({ name: "materialId" })
  material!: Material;

  @Column({ type: "integer" })
  position!: number;
}
