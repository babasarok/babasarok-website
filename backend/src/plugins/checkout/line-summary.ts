import { selectionDetails, type ProductDefinition } from "../../shared/product-definition/index";
import { Injectable } from "@nestjs/common";
import { EventBus, OrderLine, OrderLineEvent, TransactionalConnection } from "@vendure/core";
import { In } from "typeorm";
import { selectionLabels, selectionsOf } from "../product/line-labels";
import { ProductDefinition as ProductDefinitionEntity } from "../product/product.entity";

/**
 * Keeps each native order line's `configText` custom field in sync with its
 * structured `selections`: the buyer-visible configuration as Hungarian
 * "label: value" lines (indented by visibility depth), computed server-side
 * from the canonical product definition. The dashboard's order items table
 * renders that field; legacy quote lines (no native definition) keep the
 * summary their own flow wrote.
 */
@Injectable()
export class LineSummaryService {
  constructor(
    private eventBus: EventBus,
    private connection: TransactionalConnection
  ) {}

  onApplicationBootstrap(): void {
    this.eventBus.ofType(OrderLineEvent).subscribe((event) => {
      void this.writeSummary(event);
    });
  }

  private async writeSummary(event: OrderLineEvent): Promise<void> {
    if (event.type !== "created" && event.type !== "updated") {
      return;
    }

    const { ctx } = event;
    const lines = await this.connection.getRepository(ctx, OrderLine).find({
      where: { id: event.orderLine.id },
      relations: { productVariant: true },
    });
    const line = lines.at(0);

    if (!line) {
      return;
    }

    const productId = line.productVariant.productId;
    const definitionRows = await this.connection
      .getRepository(ctx, ProductDefinitionEntity)
      .find({ where: { nativeProductId: In([Number(productId)]) } });
    const definition: ProductDefinition | undefined = definitionRows.at(0)?.definition;

    if (!definition) {
      return;
    }

    const selections = selectionsOf(line.customFields.selections);
    const labels = await selectionLabels(this.connection, ctx, [selections]);
    const text = selectionDetails({
      definition,
      selections,
      lengthCm: line.customFields.lengthCm ?? null,
      labels,
      languageCode: ctx.languageCode,
    })
      .map((detail) => `${"  ".repeat(detail.depth)}${detail.label}: ${detail.value}`)
      .join("\n");

    line.customFields.configText = text;
    await this.connection.getRepository(ctx, OrderLine).save(line);
  }
}
