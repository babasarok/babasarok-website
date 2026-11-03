import path from "node:path";
import type { OrderPlacedStrategy, RequestContext, VendureConfig } from "@vendure/core";
import {
  Asset,
  configureDefaultOrderProcess,
  defaultPromotionActions,
  defaultPromotionConditions,
  DefaultJobQueuePlugin,
  DefaultMoneyStrategy,
  DefaultSearchPlugin,
  LanguageCode,
} from "@vendure/core";
import { AssetServerPlugin } from "@vendure/asset-server-plugin";
import { DashboardPlugin } from "@vendure/dashboard/plugin";
import { EmailPlugin, FileBasedTemplateLoader } from "@vendure/email-plugin";
import type { EmailPluginDevModeOptions, EmailPluginOptions } from "@vendure/email-plugin";
import { ASSET_PRESETS, ASSET_QUALITY } from "./asset-presets";
import { PresetOrOriginalStrategy } from "./preset-or-original-strategy";
import { env } from "./env";
import { z } from "zod";
import { HandlebarsHtmlGenerator } from "./plugins/email/handlebars-html-generator";
import { CloudflareEmailSender } from "./plugins/email/cloudflare-email-sender";
import {
  nativeOrderConfirmationHandler,
  nativeOrderNotificationHandler,
  orderConfirmationHandler,
  orderNotificationHandler,
} from "./plugins/email/order-emails";
import { MaterialPlugin } from "./plugins/material/material.plugin";
import { CheckoutPlugin } from "./plugins/checkout/checkout.plugin";
import { PricingPlugin } from "./plugins/pricing/pricing.plugin";
import { MAX_LINE_LENGTH_CM } from "@babasarok/pricing";
import { ServerPricingStrategy } from "./plugins/pricing/pricing-strategy";
import {
  productSetBasketCondition,
  productSetDiscountAction,
} from "./plugins/product-set/promotion";
import { ProductSetPlugin } from "./plugins/product-set/product-set.plugin";
import { ProductPlugin } from "./plugins/product/product.plugin";
import { hexColorError } from "./plugins/product/thread-color";
import { QuoteOrderPlugin } from "./plugins/quote-order/quote-order.plugin";
import { ChannelSetupPlugin } from "./plugins/setup/channel-setup.plugin";

// Zod's built-in validation messages surface to the owner (definition and
// material validation); the Hungarian locale localizes them for every process
// that loads this config (server, worker, migrations, dashboard build).
z.config(z.locales.hu());

/** Prices are whole Forints everywhere (definitions, seed, sync, order lines);
 * the default precision 2 would make the stock dashboard read a stored 15000
 * as 150.00 Ft. Precision only changes how UIs display minor units — the
 * stored value is untouched. */
class ForintMoneyStrategy extends DefaultMoneyStrategy {
  override readonly precision = 0;
}

function emailPluginOptions(): EmailPluginOptions | EmailPluginDevModeOptions {
  const base = {
    templateLoader: new FileBasedTemplateLoader(path.join(__dirname, "..", "email-templates")),
    // Plain-HTML handlebars templates, not MJML.
    emailGenerator: new HandlebarsHtmlGenerator(),
    handlers: [
      orderConfirmationHandler,
      orderNotificationHandler,
      nativeOrderConfirmationHandler,
      nativeOrderNotificationHandler,
    ],
    globalTemplateVars: { fromAddress: env.orderEmailFrom },
  };

  const email = env.email;
  switch (email.kind) {
    case "cloudflare":
      // The Hetzner box cannot submit SMTP (25/465 blocked), so mail leaves
      // through Cloudflare's REST API over 443; CLOUDFLARE_EMAIL_TOKEN holds
      // the API token. `transport: none` keeps the default sender idle — the
      // custom sender does the sending.
      return {
        ...base,
        transport: { type: "none" },
        emailSender: new CloudflareEmailSender({
          accountId: email.accountId,
          apiToken: email.apiToken,
        }),
      };
    case "file":
      return {
        ...base,
        devMode: true,
        outputPath: path.join(process.cwd(), "email-out"),
        route: "/mailbox",
      };
    case "smtp":
      return {
        ...base,
        transport: {
          type: "smtp",
          host: email.smtp.host,
          port: email.smtp.port,
          secure: email.smtp.secure,
          ...(email.smtp.user
            ? { auth: { user: email.smtp.user, pass: email.smtp.pass ?? "" } }
            : {}),
        },
      };
  }
}

// A quote order is "placed" the moment the buyer submits it: the flow stops at
// ArrangingPayment (no payment integration yet) and must not linger as an
// active order. Revisit when Barion lands.
export class QuoteOrderPlacedStrategy implements OrderPlacedStrategy {
  shouldSetAsPlaced(_ctx: RequestContext, fromState: string, toState: string): boolean {
    return fromState === "AddingItems" && toState === "ArrangingPayment";
  }
}

export const config: VendureConfig = {
  defaultLanguageCode: LanguageCode.hu,
  apiOptions: {
    port: env.port,
    adminApiPath: "admin-api",
    shopApiPath: "shop-api",
    // Without an allowlist (local dev), the request origin is reflected. The
    // dashboard client sends credentials: 'include' on every request, so the
    // browser rejects any cross-origin response unless the origin is exact
    // (never *) and Allow-Credentials is set — also what lets the login
    // response's vendure-auth-token header reach the dashboard (Vendure adds
    // the exposedHeaders entry only for object cors options).
    cors: env.allowedOrigins
      ? { origin: env.allowedOrigins, credentials: true }
      : { origin: true, credentials: true },
    csrfPrevention: true,
    middleware: [
      {
        // Liveness endpoint the deploy chain gates on.
        route: "/health",
        handler: (
          _req: unknown,
          res: { status: (n: number) => { send: (s: string) => void } },
          _next: () => void
        ) => {
          res.status(200).send("ok");
        },
      },
    ],
  },
  authOptions: {
    // Bearer lets the dashboard, served from the site (incl. workers.dev
    // previews, cross-site to the API), authenticate without third-party
    // cookies.
    tokenMethod: ["cookie", "bearer"],
    cookieOptions: { secret: env.tokenSecret },
    superadminCredentials: {
      identifier: env.superadmin.email ?? "admin@babasarok.local",
      // Vendure's own superadmin bootstrap (AdministratorService.initAdministrators)
      // consumes these; an empty password would skip the loud dev warning.
      password: env.superadmin.password ?? "superadmin",
    },
  },
  orderOptions: {
    process: [configureDefaultOrderProcess({ arrangingPaymentRequiresShipping: false })],
    orderPlacedStrategy: new QuoteOrderPlacedStrategy(),
    orderItemPriceCalculationStrategy: new ServerPricingStrategy(),
  },
  // Prices are whole Forints everywhere (definitions, seed, sync, order lines);
  // the default precision 2 would make the stock dashboard read a stored
  // 15000 as 150.00 Ft. Precision only changes how UIs display minor units.
  entityOptions: {
    moneyStrategy: new ForintMoneyStrategy(),
  },
  paymentOptions: { paymentMethodHandlers: [] },
  promotionOptions: {
    promotionConditions: [...defaultPromotionConditions, productSetBasketCondition],
    promotionActions: [...defaultPromotionActions, productSetDiscountAction],
  },
  dbConnectionOptions: {
    type: "postgres",
    url: env.databaseUrl,
    migrations: [path.join(__dirname, "migrations/*.js")],
    // Schema changes land as generated migrations (generate-migration.ts),
    // run by the server and worker on boot. No synchronize anywhere: server
    // and worker share one database.
  },
  plugins: [
    QuoteOrderPlugin,
    MaterialPlugin,
    ProductPlugin,
    ProductSetPlugin,
    PricingPlugin,
    CheckoutPlugin,
    ChannelSetupPlugin,
    // Owns the material/product imagery (ADR 0009): uploads and previews are
    // stored on local disk (a docker volume in deploys) and served at /assets.
    AssetServerPlugin.init({
      route: "assets",
      assetUploadDir: "assets",
      presets: [...ASSET_PRESETS],
      imageTransformStrategy: new PresetOrOriginalStrategy({
        defaultPreset: "card-lg",
        permittedQuality: [ASSET_QUALITY],
        permittedFormats: ["webp"],
      }),
    }),
    DefaultJobQueuePlugin.init({}),
    // Ships in core; keeps the Admin UI's search views functional. Search
    // quality (boosting, facets) is a later milestone.
    DefaultSearchPlugin.init({ indexStockStatus: false }),
    EmailPlugin.init(emailPluginOptions()),
    // Provides the dashboard's admin API (metrics, settings store, saved
    // views). Not init()-ed, so it serves no UI: the app is built by the
    // site's Astro build and served by the site's Worker (ADR 0008).
    DashboardPlugin,
  ],
  customFields: {
    Order: [
      { name: "message", type: "text" },
      { name: "deliveryMethodName", type: "text" },
      { name: "deliveryPrice", type: "int" },
      { name: "deliveryFree", type: "boolean" },
      { name: "orderTotal", type: "int" },
      { name: "setDiscountSummary", type: "text" },
      { name: "termsAccepted", type: "boolean" },
      // Not Order.transactionId: that native field is derived from Payments
      // (none in the quote flow), and a same-named customField would collide
      // with it in the GraphQL schema.
      { name: "submissionTransactionId", type: "string" },
    ],
    // The quoted* names keep these apart from Vendure's native unitPrice /
    // lineTotal columns, which stay 0 until the site's cutover stops quoting
    // client-side. The pricing fields carry what the server's own pricing
    // needs (ADR 0010 delivery step 5); keep the OrderLine array contiguous —
    // gql regeneration diffs against the other branch's field edits.
    OrderLine: [
      { name: "title", type: "string" },
      { name: "configText", type: "text" },
      { name: "detailsJson", type: "text", nullable: true },
      { name: "quotedUnitPrice", type: "int" },
      { name: "quotedLineTotal", type: "int" },
      {
        name: "lengthCm",
        type: "int",
        min: 1,
        max: MAX_LINE_LENGTH_CM,
        label: [{ languageCode: LanguageCode.hu, value: "Hossz (cm)" }],
      },
      { name: "selections", type: "text" },
    ],
    // Email addresses editable in the dashboard's channel settings; the env
    // values are the fallback (and what exists before this field is filled).
    ShippingMethod: [
      {
        name: "requiresAddress",
        type: "boolean",
        defaultValue: false,
        label: [{ languageCode: LanguageCode.hu, value: "Szállítási cím szükséges" }],
        description: [
          {
            languageCode: LanguageCode.hu,
            value: "Igen esetén a vevőnek szállítási címet kell megadnia a rendeléshez.",
          },
        ],
      },
    ],
    Channel: [
      {
        name: "orderEmailFrom",
        type: "string",
        label: [{ languageCode: LanguageCode.hu, value: "Rendelés-e-mail feladója" }],
        description: [
          {
            languageCode: LanguageCode.hu,
            value:
              'A rendelés-e-mailek From: fejléce, pl. "Babasarok <orders@babasarok.net>". A tartomány (babasarok.net) a Cloudflare-ben hitelesített — idegen feladó cím sikertelen küldést okoz.',
          },
        ],
        nullable: true,
      },
      {
        name: "shopOwnerEmail",
        type: "string",
        label: [{ languageCode: LanguageCode.hu, value: "Értesítési e-mail cím (tulaj)" }],
        description: [
          {
            languageCode: LanguageCode.hu,
            value:
              "Ide megy az értesítés minden új rendelésről. Üresen hagyva a kiszolgálón beállított cím marad érvényben.",
          },
        ],
        nullable: true,
      },
    ],
    Product: [
      {
        name: "shortDescription",
        type: "localeText",
        label: [{ languageCode: LanguageCode.hu, value: "Rövid leírás" }],
        description: [
          {
            languageCode: LanguageCode.hu,
            value: "Rövid szöveg a terméklistához (keresés és kártyaszöveg).",
          },
        ],
        nullable: true,
      },
      {
        name: "tagline",
        type: "localeString",
        label: [{ languageCode: LanguageCode.hu, value: "Alcím" }],
        description: [
          { languageCode: LanguageCode.hu, value: "A lista és a részletező oldal alcíme." },
        ],
        nullable: true,
      },
      {
        name: "date",
        type: "datetime",
        label: [{ languageCode: LanguageCode.hu, value: "Dátum" }],
        description: [
          { languageCode: LanguageCode.hu, value: "A „legújabb elöl” lista rendezéséhez." },
        ],
        nullable: true,
      },
      {
        name: "icon",
        type: "relation",
        entity: Asset,
        onDelete: "SET NULL",
        label: [{ languageCode: LanguageCode.hu, value: "Termék ikon" }],
        description: [
          { languageCode: LanguageCode.hu, value: "Opcionális ikon a rendelési felülethez." },
        ],
        nullable: true,
      },
      {
        name: "popularityRank",
        type: "int",
        min: 1,
        label: [{ languageCode: LanguageCode.hu, value: "Népszerűségi sorrend" }],
        description: [
          {
            languageCode: LanguageCode.hu,
            value:
              "A „Népszerű” rendezés sorrendje (1 = legelöl). Az üresen hagyott termékek a rangsoroltak után kerülnek.",
          },
        ],
        nullable: true,
      },
    ],
    Collection: [
      {
        name: "setDiscount",
        type: "int",
        label: [{ languageCode: LanguageCode.hu, value: "Szett-kedvezmény (Ft)" }],
        description: [
          {
            languageCode: LanguageCode.hu,
            value:
              "Egy képződött szett-példány által levont fix forint. Csak a Szettek alatti gyűjteményeken használatos; üresen a gyűjtemény nem szett.",
          },
        ],
        nullable: true,
        validate: (value: unknown) => {
          if (value === null || value === undefined) {
            return;
          }

          if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
            return "A szett-kedvezmény pozitív egész forint lehet.";
          }
        },
      },
    ],
    FacetValue: [
      {
        name: "hex",
        type: "string",
        label: [{ languageCode: LanguageCode.hu, value: "Színkód (hex)" }],
        description: [
          {
            languageCode: LanguageCode.hu,
            value:
              "#rrggbb formátumban (pl. #9caf88). A cérnaszínek facetnél a minta képe elsőbbséget élvez.",
          },
        ],
        nullable: true,
        validate: hexColorError,
      },
      {
        name: "swatch",
        type: "relation",
        entity: Asset,
        onDelete: "SET NULL",
        label: [{ languageCode: LanguageCode.hu, value: "Minta (kép)" }],
        description: [
          {
            languageCode: LanguageCode.hu,
            value: "A cérnaszín képe; ha nincs, a színkód látszik.",
          },
        ],
        nullable: true,
      },
    ],
    Asset: [
      {
        name: "galleryDescription",
        type: "localeText",
        label: [{ languageCode: LanguageCode.hu, value: "Képleírás" }],
        description: [
          { languageCode: LanguageCode.hu, value: "A termék galériájában a kép alatti leírás." },
        ],
        nullable: true,
      },
    ],
  },
};
