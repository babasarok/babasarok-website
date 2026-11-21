import { LanguageCode, PaymentMethodEligibilityChecker, PaymentMethodHandler } from "@vendure/core";

export const bankTransferHandler = new PaymentMethodHandler({
  code: "bank-transfer",
  description: [
    {
      languageCode: LanguageCode.hu,
      value:
        "Banki átutalás rögzítése a dashboardon — a vevő a fizetés lépésben sosem választhatja",
    },
  ],
  args: {},
  createPayment: (_ctx, _order, amount) => ({ amount, state: "Settled" }),
  settlePayment: () => ({ success: true }),
});

export const bankTransferChecker = new PaymentMethodEligibilityChecker({
  code: "bank-transfer-ineligible",
  description: [
    {
      languageCode: LanguageCode.hu,
      value: "Sosem jogosult: az átutalást a tulaj rögzíti a rendelésen, a vevő nem fizethet vele",
    },
  ],
  args: {},
  check: () => false,
});
