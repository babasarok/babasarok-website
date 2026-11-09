import { FacetValue } from "@vendure/core";
import type { RequestContext, TransactionalConnection } from "@vendure/core";
import type { ProductDefinition as CanonicalProductDefinition } from "../../shared/product-definition/index";
import { In } from "typeorm";
import { MaterialColor } from "../material/material.entity";
import { THREAD_COLOR_FACET_CODE } from "../product/facet-codes";
import { nativeProductNames } from "../product/native-names";
import { ProductDefinition } from "../product/product.entity";
import type { LineFacts } from "./line-rejection";

/** The database-backed facts a line check needs. */
export class DatabaseLineFacts implements LineFacts {
  constructor(
    private connection: TransactionalConnection,
    private ctx: RequestContext
  ) {}

  /** The canonical definition when the variant belongs to a generated product. */
  async generatedDefinition(productId: number): Promise<CanonicalProductDefinition | undefined> {
    const row = await this.connection.getRepository(this.ctx, ProductDefinition).findOne({
      where: { nativeProductId: productId },
      select: { id: true, definition: true },
    });

    return row?.definition;
  }

  async productName(productId: number, definition: CanonicalProductDefinition): Promise<string> {
    const names = await nativeProductNames(this.connection, this.ctx, [productId]);

    return names.get(productId) || definition.id;
  }

  async knownThreadColors(colorIds: string[]): Promise<Set<string>> {
    const known = await this.connection.getRepository(this.ctx, FacetValue).find({
      where: { code: In(colorIds), facet: { code: THREAD_COLOR_FACET_CODE } },
      select: { code: true },
    });

    return new Set(known.map((value) => value.code));
  }

  async materialColors(materialSlugs: string[]): Promise<Map<string, Set<string>>> {
    const byMaterial = new Map<string, Set<string>>();

    if (materialSlugs.length === 0) {
      return byMaterial;
    }

    const colors = await this.connection.getRepository(this.ctx, MaterialColor).find({
      where: { material: { slug: In(materialSlugs) } },
      relations: { material: true },
    });

    for (const color of colors) {
      const offered = byMaterial.get(color.material.slug) ?? new Set<string>();

      offered.add(color.colorId);
      byMaterial.set(color.material.slug, offered);
    }

    return byMaterial;
  }
}
