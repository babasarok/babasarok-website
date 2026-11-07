import { LanguageCode, Promotion, ShippingMethod } from "@vendure/core";
import type {
  PromotionService,
  RequestContext,
  ShippingMethodService,
  TransactionalConnection,
} from "@vendure/core";

const SEED_LOCK_KEY = 5_130_001;

export interface SeedShippingMethod {
  code: string;
  name: string;
  rate: number;
  requiresAddress: boolean;
}

export const SHIPPING_METHODS: readonly SeedShippingMethod[] = [
  {
    code: "gls-elore-utalas",
    name: "GLS házhozszállítás előre utalással",
    rate: 2500,
    requiresAddress: true,
  },
  {
    code: "gls-utanvet",
    name: "GLS házhozszállítás utánvéttel (előleg szükséges)",
    rate: 3500,
    requiresAddress: true,
  },
  {
    code: "szemelyes",
    name: "Személyes átvétel Telkibányán",
    rate: 0,
    requiresAddress: false,
  },
];

export const FREE_SHIPPING_PROMOTION_NAME = "Ingyenes szállítás 60 000 Ft felett";
export const FREE_SHIPPING_THRESHOLD = 60_000;

/**
 * The server and the worker both boot the setup plugin; the advisory lock
 * makes the second one wait and then find the first one's rows.
 */
async function withSeedLock(
  connection: TransactionalConnection,
  work: () => Promise<void>
): Promise<void> {
  const runner = connection.rawConnection.createQueryRunner();

  await runner.connect();
  await runner.query("select pg_advisory_lock($1)", [SEED_LOCK_KEY]);

  try {
    await work();
  } finally {
    await runner.query("select pg_advisory_unlock($1)", [SEED_LOCK_KEY]);
    await runner.release();
  }
}

async function seedShippingMethod(
  connection: TransactionalConnection,
  shippingMethodService: ShippingMethodService,
  ctx: RequestContext,
  method: SeedShippingMethod
): Promise<void> {
  const existing = await connection
    .getRepository(ctx, ShippingMethod)
    .findOne({ where: { code: method.code }, withDeleted: true });

  if (existing !== null) {
    return;
  }

  await shippingMethodService.create(ctx, {
    code: method.code,
    fulfillmentHandler: "manual-fulfillment",
    checker: {
      code: "default-shipping-eligibility-checker",
      arguments: [{ name: "orderMinimum", value: "0" }],
    },
    calculator: {
      code: "default-shipping-calculator",
      arguments: [
        { name: "rate", value: String(method.rate) },
        { name: "includesTax", value: "include" },
        { name: "taxRate", value: "0" },
      ],
    },
    translations: [{ languageCode: LanguageCode.hu, name: method.name, description: "" }],
    customFields: { requiresAddress: method.requiresAddress },
  });
}

async function seedFreeShippingPromotion(
  connection: TransactionalConnection,
  promotionService: PromotionService,
  ctx: RequestContext
): Promise<void> {
  const existing = await connection.getRepository(ctx, Promotion).findOne({
    where: { translations: { name: FREE_SHIPPING_PROMOTION_NAME } },
    withDeleted: true,
  });

  if (existing !== null) {
    return;
  }

  const created = await promotionService.createPromotion(ctx, {
    enabled: true,
    conditions: [
      {
        code: "minimum_order_amount",
        arguments: [
          { name: "amount", value: String(FREE_SHIPPING_THRESHOLD) },
          { name: "taxInclusive", value: "true" },
        ],
      },
    ],
    actions: [{ code: "free_shipping", arguments: [] }],
    translations: [
      { languageCode: LanguageCode.hu, name: FREE_SHIPPING_PROMOTION_NAME, description: "" },
    ],
  });

  if ("errorCode" in created) {
    throw new Error(created.message);
  }
}

/**
 * Create-if-missing, never overwritten: the owner edits the methods and the
 * promotion in the dashboard afterwards (ADR 0013 decisions 2 and 3).
 */
export async function seedDelivery(
  connection: TransactionalConnection,
  shippingMethodService: ShippingMethodService,
  promotionService: PromotionService,
  ctx: RequestContext
): Promise<void> {
  await withSeedLock(connection, async () => {
    for (const method of SHIPPING_METHODS) {
      await seedShippingMethod(connection, shippingMethodService, ctx, method);
    }

    await seedFreeShippingPromotion(connection, promotionService, ctx);
  });
}
