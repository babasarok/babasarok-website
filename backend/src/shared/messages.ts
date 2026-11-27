/**
 * Text the server renders itself, one table per language: line detail labels
 * (shared with the site's basket rows) and order emails. Refusals are codes
 * (`shared/refusal.ts`) the site words from its own locale files (ADR 0015
 * decision 5).
 */
export type MessageLanguage = "hu" | "en";

export function messageLanguage(languageCode: string): MessageLanguage {
  return languageCode === "en" ? "en" : "hu";
}

const hu = {
  defaultProductName: (): string => "A termék",
  detailLength: (): string => "Hossz",
  detailCustom: (value: string): string => `Egyedi: ${value}`,
  detailToggleOff: (): string => "Nem",
  detailToggleOn: (): string => "Igen",
  deliveryFree: (): string => "ingyenes",
  productOrdinal: (number: number): string => `${number}. termék`,
  productionTime: (days: number): string =>
    days >= 7 && days % 7 === 0 ? `${days / 7} hét` : `${days} nap`,
  orderConfirmationSubject: (orderCode: string): string => `Köszönjük a rendelésed: ${orderCode}`,
  orderNotificationSubject: (orderCode: string): string => `Új árajánlatkérés: ${orderCode}`,
  glsShippedSubject: (orderCode: string): string => `Rendelésed úton van: ${orderCode}`,
  glsProblemSubject: (orderCode: string): string => `GLS-probléma a(z) ${orderCode} rendelésnél`,
};

type Messages = typeof hu;

const en: Messages = {
  defaultProductName: () => "The product",
  detailLength: () => "Length",
  detailCustom: (value) => `Custom: ${value}`,
  detailToggleOff: () => "No",
  detailToggleOn: () => "Yes",
  deliveryFree: () => "free",
  productOrdinal: (number) => `product ${number}`,
  productionTime: (days) => {
    if (days >= 7 && days % 7 === 0) {
      const weeks = days / 7;

      return weeks === 1 ? "1 week" : `${weeks} weeks`;
    }

    return days === 1 ? "1 day" : `${days} days`;
  },
  orderConfirmationSubject: (orderCode) => `Thank you for your order: ${orderCode}`,
  orderNotificationSubject: (orderCode) => `New quote request: ${orderCode}`,
  glsShippedSubject: (orderCode) => `Your order is on its way: ${orderCode}`,
  glsProblemSubject: (orderCode) => `GLS problem with order ${orderCode}`,
};

const TABLE: Record<MessageLanguage, Messages> = { hu, en };

export function messages(languageCode: string): Messages {
  return TABLE[messageLanguage(languageCode)];
}
