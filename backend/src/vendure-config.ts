import path from "node:path";
import { existsSync } from "node:fs";
import {
  configureDefaultOrderProcess,
  DefaultJobQueuePlugin,
  DefaultSearchPlugin,
  LanguageCode,
  OrderPlacedStrategy,
  RequestContext,
  VendureConfig,
} from "@vendure/core";
import { AdminUiPlugin } from "@vendure/admin-ui-plugin";
import { EmailPlugin, FileBasedTemplateLoader } from "@vendure/email-plugin";
import type { EmailPluginDevModeOptions, EmailPluginOptions } from "@vendure/email-plugin";
import { env } from "./env";
import { adminUiDistPath } from "./paths";
import { HandlebarsHtmlGenerator } from "./email/handlebars-html-generator";
import { orderConfirmationHandler, orderNotificationHandler } from "./email/order-emails";
import { QuoteOrderPlugin } from "./quote-order/quote-order.plugin";
import { ChannelSetupPlugin } from "./setup/channel-setup.plugin";

function emailPluginOptions(): EmailPluginOptions | EmailPluginDevModeOptions {
  const base = {
    templateLoader: new FileBasedTemplateLoader(path.join(__dirname, "..", "email-templates")),
    // Plain-HTML handlebars templates, not MJML.
    emailGenerator: new HandlebarsHtmlGenerator(),
    handlers: [orderConfirmationHandler, orderNotificationHandler],
    globalTemplateVars: { fromAddress: env.orderEmailFrom },
  };

  const smtp = env.smtp;
  if (!smtp) {
    return {
      ...base,
      devMode: true,
      outputPath: path.join(process.cwd(), "email-out"),
      route: "/mailbox",
    };
  }

  return {
    ...base,
    transport: {
      type: "smtp",
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      ...(smtp.user ? { auth: { user: smtp.user, pass: smtp.pass ?? "" } } : {}),
    },
  };
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
    cors: env.allowedOrigins ? { origin: env.allowedOrigins } : true,
    csrfPrevention: true,
    middleware: [
      {
        // Liveness endpoint the deploy chain gates on.
        route: "/health",
        handler: (_req: unknown, res: { status: (n: number) => { send: (s: string) => void } }, next: () => void) => {
          res.status(200).send("ok");
        },
      },
    ],
  },
  authOptions: {
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
  },
  paymentOptions: { paymentMethodHandlers: [] },
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
    ChannelSetupPlugin,
    DefaultJobQueuePlugin.init({}),
    // Ships in core; keeps the Admin UI's search views functional. Search
    // quality (boosting, facets) is a later milestone.
    DefaultSearchPlugin.init({ indexStockStatus: false }),
    EmailPlugin.init(emailPluginOptions()),
    // Serves the management dashboard at /admin-ui. The custom build (with
    // Hungarian) is produced by build-admin-ui.ts; fall back to the bundled
    // English app while it does not exist. The port must match the API server
    // so the UI can reach the admin-api GraphQL endpoint.
    AdminUiPlugin.init({
      route: "admin-ui",
      port: env.port,
      ...(existsSync(path.join(adminUiDistPath, "index.html"))
        ? { app: { path: adminUiDistPath } }
        : {}),
      adminUiConfig: {
        defaultLanguage: LanguageCode.hu,
        availableLanguages: [LanguageCode.hu, LanguageCode.en],
      },
    }),
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
    // lineTotal columns, which stay 0 until the server-side re-pricing
    // integration moves price authority into Vendure.
    OrderLine: [
      { name: "title", type: "string" },
      { name: "configText", type: "text" },
      { name: "quotedUnitPrice", type: "int" },
      { name: "quotedLineTotal", type: "int" },
    ],
  },
};
