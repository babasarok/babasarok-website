import path from "node:path";
import type {
  OrderPlacedStrategy,
  RequestContext,
  StockAllocationStrategy,
  VendureConfig,
} from "@vendure/core";
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
import { lifecycleOrderProcess } from "./order-state-process";
import { OrderLifecyclePlugin } from "./plugins/order-lifecycle/order-lifecycle.plugin";
import { AssetServerPlugin } from "@vendure/asset-server-plugin";
import { DashboardPlugin } from "@vendure/dashboard/plugin";
import { EmailPlugin } from "@vendure/email-plugin";
import { DefaultSchedulerPlugin } from "@vendure/core";
import { LocaleTemplateLoader } from "./plugins/email/localized-template-loader";
import type { EmailPluginDevModeOptions, EmailPluginOptions } from "@vendure/email-plugin";
import { ASSET_PRESETS, ASSET_QUALITY } from "./shared/asset-presets";
import { PresetOrOriginalStrategy } from "./preset-or-original-strategy";
import { env } from "./env";
import { GLS_SENDER_FIELD } from "./plugins/gls/gls-sender";
import { GlsPlugin } from "./plugins/gls/gls.plugin";
import { glsProblemHandler, glsShippedHandler } from "./plugins/gls/gls-emails";
import { glsStatusPollTask } from "./plugins/gls/gls-poll-task";
import { BarionPlugin } from "./plugins/barion/barion.plugin";
import { barionHandler } from "./plugins/barion/barion.handler";
import { z } from "zod";
import { HandlebarsHtmlGenerator } from "./plugins/email/handlebars-html-generator";
import { CloudflareEmailSender } from "./plugins/email/cloudflare-email-sender";
import {
  nativeOrderConfirmationHandler,
  nativeOrderNotificationHandler,
} from "./plugins/email/order-emails";
import { MaterialPlugin } from "./plugins/material/material.plugin";
import { CheckoutPlugin } from "./plugins/checkout/checkout.plugin";
import { PricingPlugin } from "./plugins/pricing/pricing.plugin";
import { MAX_LINE_LENGTH_CM } from "./shared/pricing/index";
import { ServerPricingStrategy } from "./plugins/pricing/pricing-strategy";
import {
  productSetDiscountAction,
  productSetMembersCondition,
} from "./plugins/product-set/promotion";
import { ProductSetPlugin } from "./plugins/product-set/product-set.plugin";
import { ProductPlugin } from "./plugins/product/product.plugin";
import { AuditPlugin } from "./plugins/audit/audit.plugin";
import { TranslationDriftPlugin } from "./plugins/translation-drift/translation-drift.plugin";
import { hexColorError } from "./plugins/product/thread-color";
import { ChannelSetupPlugin } from "./plugins/setup/channel-setup.plugin";
import { bankTransferChecker, bankTransferHandler } from "./bank-transfer-handler";

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
    templateLoader: new LocaleTemplateLoader(path.join(__dirname, "..", "email-templates")),
    // Plain-HTML handlebars templates, not MJML.
    emailGenerator: new HandlebarsHtmlGenerator(),
    handlers: [
      nativeOrderConfirmationHandler,
      nativeOrderNotificationHandler,
      glsShippedHandler,
      glsProblemHandler,
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

// An order is "placed" the moment the buyer submits checkout: the flow stops
// at ArrangingPayment (no payment integration yet) and must not linger as an
// active order. Revisit when Barion lands.
export class QuoteOrderPlacedStrategy implements OrderPlacedStrategy {
  shouldSetAsPlaced(_ctx: RequestContext, fromState: string, toState: string): boolean {
    return fromState === "AddingItems" && toState === "ArrangingPayment";
  }
}

// Stock-tracked variants: a basket only checks stock, a placed order holds it.
// The checkout transition is the flow's final state (QuoteOrderPlacedStrategy),
// so allocation happens there; cancelling or fulfilling the placed order
// releases or sells the stock (Vendure's default behaviour). The transition
// guard's stock check locks the same rows, so two simultaneous checkouts
// cannot both take the last unit.
export class PlacedOrderStockAllocationStrategy implements StockAllocationStrategy {
  shouldAllocateStock(_ctx: RequestContext, fromState: string, toState: string): boolean {
    return fromState === "AddingItems" && toState === "ArrangingPayment";
  }
}

const CORS_PREFLIGHT_MAX_AGE_SECONDS = 7200;

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
    // the exposedHeaders entry only for object cors options). The storefront
    // calls the shop API from the browser on every catalog page; caching the
    // preflight saves those calls a round trip (Chromium caps it at 2 hours).
    cors: {
      origin: env.allowedOrigins ?? true,
      credentials: true,
      maxAge: CORS_PREFLIGHT_MAX_AGE_SECONDS,
    },
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
    process: [
      configureDefaultOrderProcess({ arrangingPaymentRequiresShipping: false }),
      lifecycleOrderProcess,
    ],
    orderPlacedStrategy: new QuoteOrderPlacedStrategy(),
    stockAllocationStrategy: new PlacedOrderStockAllocationStrategy(),
    orderItemPriceCalculationStrategy: new ServerPricingStrategy(),
  },
  // Prices are whole Forints everywhere (definitions, seed, sync, order lines);
  // the default precision 2 would make the stock dashboard read a stored
  // 15000 as 150.00 Ft. Precision only changes how UIs display minor units.
  entityOptions: {
    moneyStrategy: new ForintMoneyStrategy(),
  },
  paymentOptions: {
    paymentMethodHandlers: [bankTransferHandler, barionHandler],
    paymentMethodEligibilityCheckers: [bankTransferChecker],
  },
  promotionOptions: {
    promotionConditions: [...defaultPromotionConditions, productSetMembersCondition],
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
  // The GLS poll runs in the worker only (the DefaultSchedulerStrategy's
  // database bookkeeping keeps it exactly-once across processes).
  schedulerOptions: { tasks: [glsStatusPollTask] },
  plugins: [
    DefaultSchedulerPlugin.init(),
    MaterialPlugin,
    ProductPlugin,
    ProductSetPlugin,
    AuditPlugin,
    TranslationDriftPlugin,
    PricingPlugin,
    CheckoutPlugin,
    GlsPlugin,
    // Payments (ADR 0021 slice 1: full prepay) — orders are placed at
    // ArrangingPayment submission (QuoteOrderPlacedStrategy) and the Barion
    // callback records the money afterwards.
    BarionPlugin,
    OrderLifecyclePlugin,
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
        allowFocalPoint: true,
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
      { name: "termsAccepted", type: "boolean" },
      {
        name: "taxNumber",
        type: "string",
        label: [{ languageCode: LanguageCode.hu, value: "Adószám" }],
      },
      {
        name: "fulfillmentStartedAt",
        type: "datetime",
        nullable: true,
        label: [{ languageCode: LanguageCode.hu, value: "Gyártás elindítva" }],
        description: [
          {
            languageCode: LanguageCode.hu,
            value:
              "A tulaj ekkor kezdte el készíteni a terméket (gyártás + szállítás — a készterméket jelenti, nem a Vendure teljesítést). A visszatérítési szabály eszerint dönt.",
          },
        ],
      },
    ],
    // configText is the dashboard-visible line summary (written server-side
    // by LineSummaryService from the selections). lengthCm and selections
    // carry what the server's own pricing needs (ADR 0010 delivery step 5).
    // Legacy snapshot fields (title, detailsJson, quotedUnitPrice,
    // quotedLineTotal) were archived into private order notes by the
    // archive-legacy-order-snapshots migration and their columns dropped.
    OrderLine: [
      { name: "configText", type: "text" },
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
      {
        name: "deposit",
        type: "int",
        defaultValue: 0,
        label: [{ languageCode: LanguageCode.hu, value: "Előleg (Ft)" }],
        description: [
          {
            languageCode: LanguageCode.hu,
            value:
              "0 = teljes előre fizetés. Nagyobb érték esetén a vevő a megrendeléskor ennyi előleget fizet (Barion vagy átutalás), a fennmaradó összeget a kézbesítéskor szedjük be.",
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
      {
        name: "configuratorProductionDays",
        type: "int",
        min: 1,
        label: [
          {
            languageCode: LanguageCode.hu,
            value: "Alap elkészítési idő – konfigurálható termékek (nap)",
          },
        ],
        description: [
          {
            languageCode: LanguageCode.hu,
            value:
              "A konfigurálható termékek alap elkészítési ideje, ha a terméken nincs felülírva. Üresen hagyva 3 hét (21 nap).",
          },
        ],
        nullable: true,
      },
      {
        name: "readyMadeProductionDays",
        type: "int",
        min: 1,
        label: [
          { languageCode: LanguageCode.hu, value: "Alap elkészítési idő – késztermékek (nap)" },
        ],
        description: [
          {
            languageCode: LanguageCode.hu,
            value:
              "A késztermékek alap elkészítési ideje, ha a terméken nincs felülírva. Üresen hagyva 1 hét (7 nap).",
          },
        ],
        nullable: true,
      },
      GLS_SENDER_FIELD,
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
      {
        name: "productionDays",
        type: "int",
        min: 1,
        label: [{ languageCode: LanguageCode.hu, value: "Elkészítési idő (nap)" }],
        description: [
          {
            languageCode: LanguageCode.hu,
            value:
              "A pénztár és a rendelés-e-mailek ezt mutatják. Üresen hagyva a csatorna beállításainál megadott alapértelmezés érvényes (konfigurálható termékeknél alapból 3 hét, késztermékeknél 1 hét).",
          },
        ],
        nullable: true,
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
