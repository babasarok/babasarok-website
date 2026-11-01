import { Injectable } from "@nestjs/common";
import {
  Customer,
  CustomerService,
  OrderService,
  ProductService,
  ProductVariant,
  ProductVariantService,
  RequestContext,
  TransactionalConnection,
} from "@vendure/core";
import { GlobalFlag } from "@vendure/common/lib/generated-types";
import { splitName, QuoteOrderSchema } from "./quote-order.input";
import { env } from "../env";

// Placeholder catalog: until the real pricing integration (ADR 0001 follow-up)
// moves price authority into Vendure, variants are dumb pointers and every
// price lives on the order/line customFields. Everything a placeholder owns
// (sku, slug, name) carries the prefix so they are searchable, bulk-deletable,
// and cannot collide with slugs/skus of real products created later.
// ponytail: submitQuoteOrder is public and creates a placeholder product per
// unseen slug — unbounded catalog pollution by spam. Pre-create placeholders
// from the Tina catalog when the real pricing integration lands.
const PLACEHOLDER_PREFIX = "placeholder-";
const PLACEHOLDER_NAME_PREFIX = "[placeholder] ";

@Injectable()
export class QuoteOrderService {
  constructor(
    private connection: TransactionalConnection,
    private orderService: OrderService,
    private customerService: CustomerService,
    private productService: ProductService,
    private productVariantService: ProductVariantService
  ) {}

  async submit(ctx: RequestContext, rawInput: unknown): Promise<string> {
    const input = QuoteOrderSchema.parse(rawInput);

    // Everything that can fail without touching an Order is resolved first,
    // so a failed submission leaves no stale half-built order behind.
    const lineItems = [];
    for (const product of input.products) {
      const variant = await this.getOrCreateVariant(ctx, product.slug, product.title);
      lineItems.push({
        productVariantId: variant.id,
        quantity: product.count,
        customFields: {
          title: product.title,
          configText: product.configText,
          quotedUnitPrice: product.unitPrice,
          quotedLineTotal: product.lineTotal,
        },
      });
    }
    const customer = await this.resolveCustomer(ctx, input);

    const order = await this.orderService.create(ctx);

    const { errorResults } = await this.orderService.addItemsToOrder(ctx, order.id, lineItems);
    if (errorResults.length > 0) {
      throw new Error(errorResults.map((result) => result.message).join("; "));
    }

    await this.orderService.addCustomerToOrder(ctx, order.id, customer);

    if (input.address !== undefined) {
      await this.orderService.setShippingAddress(ctx, order.id, {
        fullName: input.name,
        streetLine1: input.address,
        phoneNumber: input.phone,
        countryCode: env.shopCountryCode,
      });
    }

    await this.orderService.updateCustomFields(ctx, order.id, {
      message: input.message ?? null,
      deliveryMethodName: input.deliveryMethod,
      deliveryPrice: input.deliveryPrice,
      deliveryFree: input.deliveryFree,
      orderTotal: input.totalPrice,
      setDiscountSummary: input.setDiscountSummary ?? null,
      termsAccepted: input.termsAccepted,
      submissionTransactionId: input.transactionId,
    });

    const placed = await this.orderService.transitionToState(ctx, order.id, "ArrangingPayment");
    if (!("code" in placed)) {
      throw new Error(placed.message);
    }
    return placed.code;
  }

  private async resolveCustomer(
    ctx: RequestContext,
    input: { email: string; name: string; phone?: string }
  ): Promise<Customer> {
    const { firstName, lastName } = splitName(input.name);
    const result = await this.customerService.createOrUpdate(ctx, {
      emailAddress: input.email,
      firstName,
      lastName,
      phoneNumber: input.phone,
    });
    if ("id" in result) {
      return result;
    }
    throw new Error(`Failed to resolve customer for ${input.email}`);
  }

  private async getOrCreateVariant(
    ctx: RequestContext,
    slug: string,
    title: string
  ): Promise<ProductVariant> {
    const sku = `${PLACEHOLDER_PREFIX}${slug}`;
    const repo = this.connection.getRepository(ctx, ProductVariant);
    const existing = await repo.findOne({ where: { sku } });
    if (existing) {
      return existing;
    }

    try {
      const product = await this.productService.create(ctx, {
        translations: [
          {
            languageCode: ctx.languageCode,
            name: `${PLACEHOLDER_NAME_PREFIX}${title}`,
            slug: sku,
            description: "",
          },
        ],
        enabled: true,
      });
      const variants = await this.productVariantService.create(ctx, [
        {
          productId: product.id,
          sku,
          price: 0,
          enabled: true,
          trackInventory: GlobalFlag.FALSE,
          translations: [
            { languageCode: ctx.languageCode, name: `${PLACEHOLDER_NAME_PREFIX}${title}` },
          ],
        },
      ]);
      const variant = variants[0];
      if (!variant) {
        throw new Error(`Variant creation returned no variant for ${sku}`);
      }
      return variant;
    } catch (error) {
      // A concurrent submission may have created the same placeholder first.
      const raced = await repo.findOne({ where: { sku } });
      if (raced) {
        return raced;
      }
      throw error;
    }
  }
}
