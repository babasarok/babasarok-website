import { TransactionalConnection } from "@vendure/core";
import type {
  Injector,
  Order,
  OrderInterceptor,
  ProductVariant,
  RequestContext,
  WillAddItemToOrderInput,
  WillAdjustOrderLineInput,
} from "@vendure/core";
import type { ProductDefinition as CanonicalProductDefinition } from "@babasarok/product-definition";
import { ProductDefinition } from "../product/product.entity";
import { nonOrderableRejection } from "./line-price";
import { parseLineSelections, LineSelectionsError } from "./line-selection";

/**
 * Rejects unpriceable configured lines at the mutation boundary with a clear
 * error result (OrderInterceptorError) instead of a thrown price calculation:
 * a non-orderable product cannot be ordered, a length-priced product requires
 * the line's length, and the selections must parse. The pricing strategy
 * re-checks all three as the backstop.
 */
export class ConfiguredOrderLineInterceptor implements OrderInterceptor {
  private connection!: TransactionalConnection;

  init(injector: Injector): void {
    this.connection = injector.get(TransactionalConnection);
  }

  async willAddItemToOrder(
    ctx: RequestContext,
    order: Order,
    input: WillAddItemToOrderInput
  ): Promise<string | undefined> {
    const definition = await this.generatedDefinition(ctx, input.productVariant);

    if (definition !== undefined && !definition.orderable) {
      return nonOrderableRejection(definition);
    }

    if (definition === undefined || definition.pricing.kind !== "length") {
      return this.selectionsError(input.customFields?.selections);
    }

    const lengthCm = input.customFields?.lengthCm;

    if (typeof lengthCm !== "number" || !Number.isInteger(lengthCm) || lengthCm <= 0) {
      return `A(z) "${definition.label}" méteráru — a hossz (cm) megadása kötelező.`;
    }

    return this.selectionsError(input.customFields?.selections);
  }

  async willAdjustOrderLine(
    ctx: RequestContext,
    order: Order,
    input: WillAdjustOrderLineInput
  ): Promise<string | undefined> {
    const definition = await this.generatedDefinition(ctx, input.orderLine.productVariant);

    if (definition !== undefined && !definition.orderable) {
      return nonOrderableRejection(definition);
    }

    if (definition === undefined || definition.pricing.kind !== "length") {
      return this.selectionsError(input.customFields?.selections);
    }

    // The mutation merges the provided custom fields over the line's own, so
    // the effective length is the incoming one when given, else the stored one.
    const provided = input.customFields?.lengthCm;
    const lengthCm =
      typeof provided === "number" ? provided : input.orderLine.customFields.lengthCm;

    if (typeof lengthCm !== "number" || !Number.isInteger(lengthCm) || lengthCm <= 0) {
      return `A(z) "${definition.label}" méteráru — a hossz (cm) megadása kötelező.`;
    }

    return this.selectionsError(input.customFields?.selections);
  }

  /** The canonical definition when the variant belongs to a generated product. */
  private async generatedDefinition(
    ctx: RequestContext,
    productVariant: ProductVariant
  ): Promise<CanonicalProductDefinition | undefined> {
    const row = await this.connection.getRepository(ctx, ProductDefinition).findOne({
      where: { nativeProductId: Number(productVariant.productId) },
      select: { id: true, definition: true },
    });

    return row?.definition;
  }

  private selectionsError(raw: unknown): string | undefined {
    try {
      parseLineSelections(raw);
    } catch (error) {
      if (error instanceof LineSelectionsError) {
        return error.message;
      }

      throw error;
    }

    return undefined;
  }
}
