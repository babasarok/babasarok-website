import { FacetValue, TransactionalConnection } from "@vendure/core";
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
import { THREAD_COLOR_FACET_CODE } from "../product/facet-plan";
import { nativeProductNames } from "../product/native-names";
import { ProductDefinition } from "../product/product.entity";
import { unknownThreadColorRejection } from "../product/thread-color";
import { In } from "typeorm";
import { lengthMissingRejection, nonOrderableRejection } from "./line-price";
import { parseLineSelections, LineSelectionsError, type LineSelections } from "./line-selection";

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

  async willAddItemToOrder(
    ctx: RequestContext,
    order: Order,
    input: WillAddItemToOrderInput
  ): Promise<string | undefined> {
    const definition = await this.generatedDefinition(ctx, input.productVariant);

    if (definition !== undefined && !definition.orderable) {
      return nonOrderableRejection(await this.productName(ctx, input.productVariant, definition));
    }

    if (definition === undefined || definition.pricing.kind !== "length") {
      return this.selectionsError(ctx, input.customFields?.selections);
    }

    const lengthCm = input.customFields?.lengthCm;

    if (typeof lengthCm !== "number" || !Number.isInteger(lengthCm) || lengthCm <= 0) {
      return lengthMissingRejection(await this.productName(ctx, input.productVariant, definition));
    }

    return this.selectionsError(ctx, input.customFields?.selections);
  }

  async willAdjustOrderLine(
    ctx: RequestContext,
    order: Order,
    input: WillAdjustOrderLineInput
  ): Promise<string | undefined> {
    const definition = await this.generatedDefinition(ctx, input.orderLine.productVariant);

    if (definition !== undefined && !definition.orderable) {
      return nonOrderableRejection(
        await this.productName(ctx, input.orderLine.productVariant, definition)
      );
    }

    if (definition === undefined || definition.pricing.kind !== "length") {
      return this.selectionsError(ctx, input.customFields?.selections);
    }

    // The mutation merges the provided custom fields over the line's own, so
    // the effective length is the incoming one when given, else the stored one.
    const provided = input.customFields?.lengthCm;
    const lengthCm =
      typeof provided === "number" ? provided : input.orderLine.customFields.lengthCm;

    if (typeof lengthCm !== "number" || !Number.isInteger(lengthCm) || lengthCm <= 0) {
      return lengthMissingRejection(
        await this.productName(ctx, input.orderLine.productVariant, definition)
      );
    }

    return this.selectionsError(ctx, input.customFields?.selections);
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

  private async productName(
    ctx: RequestContext,
    productVariant: ProductVariant,
    definition: CanonicalProductDefinition
  ): Promise<string> {
    const productId = Number(productVariant.productId);
    const names = await nativeProductNames(this.connection, ctx, [productId]);

    return names.get(productId) || definition.id;
  }

  private async selectionsError(ctx: RequestContext, raw: unknown): Promise<string | undefined> {
    let selections: LineSelections;

    try {
      selections = parseLineSelections(raw);
    } catch (error) {
      if (error instanceof LineSelectionsError) {
        return error.message;
      }

      throw error;
    }

    const colorIds = new Set(
      Object.values(selections).flatMap((selection) =>
        selection?.kind === "embroidery" ? [selection.colorId] : []
      )
    );

    if (colorIds.size === 0) {
      return undefined;
    }

    const known = await this.connection.getRepository(ctx, FacetValue).find({
      where: { code: In([...colorIds]), facet: { code: THREAD_COLOR_FACET_CODE } },
      select: { code: true },
    });
    const knownCodes = new Set(known.map((value) => value.code));
    const unknown = [...colorIds].filter((colorId) => !knownCodes.has(colorId));

    if (unknown.length > 0) {
      return unknownThreadColorRejection(unknown);
    }

    return undefined;
  }
}
