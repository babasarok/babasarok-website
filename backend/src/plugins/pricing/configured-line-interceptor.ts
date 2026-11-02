import { FacetValue, TransactionalConnection } from "@vendure/core";
import type {
  Injector,
  Order,
  OrderInterceptor,
  RequestContext,
  WillAddItemToOrderInput,
  WillAdjustOrderLineInput,
} from "@vendure/core";
import type { ProductDefinition as CanonicalProductDefinition } from "@babasarok/product-definition";
import { THREAD_COLOR_FACET_CODE } from "../product/facet-plan";
import { nativeProductNames } from "../product/native-names";
import { ProductDefinition } from "../product/product.entity";
import { In } from "typeorm";
import { MaterialColor } from "../material/material.entity";
import { lineRejection, type LineFacts } from "./line-rejection";

/**
 * Rejects unpriceable configured lines at the mutation boundary with a clear
 * error result (OrderInterceptorError) instead of a thrown price calculation:
 * a non-orderable product cannot be ordered, a length-priced product requires
 * the line's length, and the selections must parse with embroidery thread
 * colors the thread-color facet knows (ADR 0011 decision 3). The pricing
 * strategy re-checks the first three as the backstop.
 */
export class ConfiguredOrderLineInterceptor implements OrderInterceptor {
  private connection!: TransactionalConnection;

  init(injector: Injector): void {
    this.connection = injector.get(TransactionalConnection);
  }

  willAddItemToOrder(
    ctx: RequestContext,
    order: Order,
    input: WillAddItemToOrderInput
  ): Promise<string | undefined> {
    return lineRejection(this.facts(ctx), {
      productId: Number(input.productVariant.productId),
      languageCode: ctx.languageCode,
      customFields: input.customFields,
    });
  }

  willAdjustOrderLine(
    ctx: RequestContext,
    order: Order,
    input: WillAdjustOrderLineInput
  ): Promise<string | undefined> {
    return lineRejection(this.facts(ctx), {
      productId: Number(input.orderLine.productVariant.productId),
      languageCode: ctx.languageCode,
      customFields: input.customFields,
      storedLengthCm: input.orderLine.customFields.lengthCm,
    });
  }

  private facts(ctx: RequestContext): LineFacts {
    return {
      generatedDefinition: (productId) => this.generatedDefinition(ctx, productId),
      productName: (productId, definition) => this.productName(ctx, productId, definition),
      materialColors: (slugs) => this.materialColors(ctx, slugs),
      knownThreadColors: (colorIds) => this.knownThreadColors(ctx, colorIds),
    };
  }

  /** The canonical definition when the variant belongs to a generated product. */
  private async generatedDefinition(
    ctx: RequestContext,
    productId: number
  ): Promise<CanonicalProductDefinition | undefined> {
    const row = await this.connection.getRepository(ctx, ProductDefinition).findOne({
      where: { nativeProductId: productId },
      select: { id: true, definition: true },
    });

    return row?.definition;
  }

  private async productName(
    ctx: RequestContext,
    productId: number,
    definition: CanonicalProductDefinition
  ): Promise<string> {
    const names = await nativeProductNames(this.connection, ctx, [productId]);

    return names.get(productId) || definition.id;
  }

  private async knownThreadColors(ctx: RequestContext, colorIds: string[]): Promise<Set<string>> {
    const known = await this.connection.getRepository(ctx, FacetValue).find({
      where: { code: In(colorIds), facet: { code: THREAD_COLOR_FACET_CODE } },
      select: { code: true },
    });

    return new Set(known.map((value) => value.code));
  }

  private async materialColors(
    ctx: RequestContext,
    materialSlugs: string[]
  ): Promise<Map<string, Set<string>>> {
    const byMaterial = new Map<string, Set<string>>();

    if (materialSlugs.length === 0) {
      return byMaterial;
    }

    const colors = await this.connection.getRepository(ctx, MaterialColor).find({
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
