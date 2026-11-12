import { selectionDetails, type ProductDefinition } from "../../shared/product-definition/index";
import { Injectable } from "@nestjs/common";
import {
  EventBus,
  Logger,
  OrderLine,
  OrderLineEvent,
  RequestContext,
  RequestContextService,
  TransactionalConnection,
} from "@vendure/core";
import { In } from "typeorm";
import { selectionLabels, selectionsOf } from "../product/line-labels";
import { ProductDefinition as ProductDefinitionEntity } from "../product/product.entity";

const VISIBLE_ATTEMPTS = 15;
const VISIBLE_DELAY_MS = 200;

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
    private connection: TransactionalConnection,
    private requestContextService: RequestContextService
  ) {}

  onApplicationBootstrap(): void {
    this.eventBus.ofType(OrderLineEvent).subscribe((event) => {
      void this.writeSummary(event);
    });
  }

  /** An observed write never fails the business write it follows. */
  private async writeSummary(event: OrderLineEvent): Promise<void> {
    if (event.type !== "created" && event.type !== "updated") {
      return;
    }

    try {
      await this.writeWhenCommitted(event);
    } catch (error: unknown) {
      Logger.error(
        `A rendelési sor (${event.orderLine.id}) összefoglalójának írása sikertelen: ` +
          (error instanceof Error ? error.message : String(error))
      );
    }
  }

  /**
   * The event fires inside the writing transaction, so the summary runs on
   * its own connection and waits until the line is committed before reading
   * it. The buyer's request language carries over.
   */
  private async writeWhenCommitted(event: OrderLineEvent): Promise<void> {
    const ctx = await this.requestContextService.create({
      apiType: event.ctx.apiType,
      channelOrToken: event.ctx.channel,
      languageCode: event.ctx.languageCode,
    });

    for (let attempt = 0; attempt < VISIBLE_ATTEMPTS; attempt += 1) {
      const lines = await this.connection.getRepository(ctx, OrderLine).find({
        where: { id: event.orderLine.id },
        relations: { productVariant: true },
      });
      const line = lines.at(0);

      if (line) {
        await this.writeFor(ctx, line);
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, VISIBLE_DELAY_MS));
    }

    Logger.error(
      `A rendelési sor (${event.orderLine.id}) nem lett látható — az összefoglaló íratlan maradt.`
    );
  }

  private async writeFor(ctx: RequestContext, line: OrderLine): Promise<void> {
    const definitionRows = await this.connection
      .getRepository(ctx, ProductDefinitionEntity)
      .find({ where: { nativeProductId: In([Number(line.productVariant.productId)]) } });
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
