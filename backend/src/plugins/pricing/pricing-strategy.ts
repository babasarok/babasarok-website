import { EntityHydrator, type PriceCalculationResult } from "@vendure/core";
import type {
  Injector,
  Order,
  OrderItemPriceCalculationStrategy,
  ProductVariant,
  RequestContext,
} from "@vendure/core";
import { TransactionalConnection } from "@vendure/core";
import { nativeProductNames } from "../product/native-names";
import { ProductDefinition } from "../product/product.entity";
import { computeLineUnitPrice, LinePricingError } from "./line-price";
import { parseLineSelections } from "./line-selection";

/**
 * The order item price strategy for the generated catalog (ADR 0010 decision
 * 6): configured lines price from the canonical definition and the line's
 * selections, everything else passes the variant's price through — the
 * quote-order placeholders keep their client-quoted totals.
 */
export class ServerPricingStrategy implements OrderItemPriceCalculationStrategy {
  private connection!: TransactionalConnection;
  private entityHydrator!: EntityHydrator;

  init(injector: Injector): void {
    this.connection = injector.get(TransactionalConnection);
    this.entityHydrator = injector.get(EntityHydrator);
  }

  async calculateUnitPrice(
    ctx: RequestContext,
    productVariant: ProductVariant,
    orderLineCustomFields: { [key: string]: unknown },
    _order: Order,
    _quantity: number
  ): Promise<PriceCalculationResult> {
    const definitionRow = await this.connection
      .getRepository(ctx, ProductDefinition)
      .findOne({ where: { nativeProductId: Number(productVariant.productId) } });

    if (definitionRow === null) {
      return {
        price: productVariant.listPrice,
        priceIncludesTax: productVariant.listPriceIncludesTax,
      };
    }

    await this.entityHydrator.hydrate(ctx, productVariant, {
      relations: ["options", "options.group"],
    });

    const optionCodes = new Map(
      productVariant.options.map((option) => [option.group.code, option.code])
    );
    const productId = Number(productVariant.productId);
    const productName =
      (await nativeProductNames(this.connection, ctx, [productId])).get(productId) ||
      definitionRow.productId;
    const rawLengthCm = orderLineCustomFields.lengthCm;

    try {
      const price = computeLineUnitPrice({
        definition: definitionRow.definition,
        productName,
        variantListPrice: productVariant.listPrice,
        optionCodes,
        selections: parseLineSelections(orderLineCustomFields.selections),
        lengthCm: typeof rawLengthCm === "number" ? rawLengthCm : null,
        languageCode: ctx.languageCode,
      });

      return { price, priceIncludesTax: productVariant.listPriceIncludesTax };
    } catch (error) {
      if (error instanceof LinePricingError) {
        throw new Error(`Árazási hiba (${productName}): ${error.message}`);
      }

      throw error;
    }
  }
}
