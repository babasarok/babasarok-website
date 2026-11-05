import {
  Asset,
  DeepPartial,
  LanguageCode,
  LocaleString,
  Translatable,
  Translation,
  VendureEntity,
} from "@vendure/core";
import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, Unique } from "typeorm";

@Entity()
export class Material extends VendureEntity implements Translatable {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor -- VendureEntity's constructor is protected; redeclaring it public is required for the plugin's `entities` array (Type<any>), and it forwards DeepPartial input to the base
  constructor(input?: DeepPartial<Material>) {
    super(input);
  }

  /** The Tina `material_id` — the business key the canonical model references. */
  @Column({ type: "varchar", unique: true })
  slug!: string;

  label!: LocaleString;

  subtitle!: LocaleString;

  description!: LocaleString;

  @OneToMany(() => MaterialTranslation, (translation) => translation.base, { eager: true })
  translations!: Array<Translation<Material>>;

  @ManyToOne(() => Asset, { nullable: true, eager: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "thumbnailAssetId" })
  thumbnail!: Asset | null;

  @OneToMany(() => MaterialColor, (color) => color.material, { eager: true })
  colors!: MaterialColor[];
}

@Entity()
export class MaterialTranslation extends VendureEntity implements Translation<Material> {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor -- see Material
  constructor(input?: DeepPartial<Translation<Material>>) {
    super(input);
  }

  @Column({ type: "varchar" })
  languageCode!: LanguageCode;

  @Column({ type: "varchar" })
  label!: string;

  @Column({ type: "varchar", default: "" })
  subtitle!: string;

  @Column({ type: "varchar", default: "" })
  description!: string;

  @Index()
  @ManyToOne(() => Material, (material) => material.translations, { onDelete: "CASCADE" })
  base!: Material;
}

@Entity()
@Unique(["material", "colorId"])
export class MaterialColor extends VendureEntity implements Translatable {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor -- see Material
  constructor(input?: DeepPartial<MaterialColor>) {
    super(input);
  }

  @Column({ type: "varchar" })
  colorId!: string;

  label!: LocaleString;

  @OneToMany(() => MaterialColorTranslation, (translation) => translation.base, { eager: true })
  translations!: Array<Translation<MaterialColor>>;

  /** Exactly one of `hex` and `asset` is set, enforced by the canonical schema. */
  @Column({ type: "varchar", nullable: true })
  hex!: string | null;

  @ManyToOne(() => Asset, { nullable: true, eager: true, onDelete: "SET NULL" })
  asset!: Asset | null;

  @ManyToOne(() => Material, (material) => material.colors, {
    nullable: false,
    onDelete: "CASCADE",
  })
  material!: Material;

  @Column({ type: "integer" })
  position!: number;
}

@Entity()
export class MaterialColorTranslation extends VendureEntity implements Translation<MaterialColor> {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor -- see Material
  constructor(input?: DeepPartial<Translation<MaterialColor>>) {
    super(input);
  }

  @Column({ type: "varchar" })
  languageCode!: LanguageCode;

  @Column({ type: "varchar" })
  label!: string;

  @Index()
  @ManyToOne(() => MaterialColor, (color) => color.translations, { onDelete: "CASCADE" })
  base!: MaterialColor;
}
