import { FulfillmentHandler, LanguageCode } from "@vendure/core";
import { GLS_HANDLER_CODE } from "./gls-label-request";
import { GlsService } from "./gls.service";

let glsService: GlsService | undefined;

function service(): GlsService {
  if (!glsService) {
    throw new Error("The GLS fulfillment handler was used before GlsPlugin initialised it");
  }

  return glsService;
}

export const glsFulfillmentHandler = new FulfillmentHandler({
  code: GLS_HANDLER_CODE,
  description: [
    { languageCode: LanguageCode.hu, value: "GLS csomagcímke" },
    { languageCode: LanguageCode.en, value: "GLS parcel label" },
  ],
  args: {},
  init(injector) {
    glsService = injector.get(GlsService);
  },
  createFulfillment: (ctx, orders, lines) => service().createLabel(ctx, orders, lines),
  onFulfillmentTransition: async (_from, to, { ctx, fulfillment }) => {
    if (to === "Delivered") {
      await service().dropLabelPdfFor(ctx, fulfillment);
      return;
    }

    if (to !== "Cancelled") {
      return;
    }

    const refusal = await service().deleteLabelFor(ctx, fulfillment);

    if (refusal !== undefined) {
      return refusal;
    }
  },
});
