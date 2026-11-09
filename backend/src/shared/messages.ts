/**
 * Buyer-visible server messages, one table per language (ADR 0015 decision 5):
 * the site renders what the server says, so these are the single source of
 * truth — the tables are pure data, safe for the site bundle via
 * `@babasarok/pricing`/`@babasarok/product-definition`.
 */
export type MessageLanguage = "hu" | "en";

export function messageLanguage(languageCode: string): MessageLanguage {
  return languageCode === "en" ? "en" : "hu";
}

const hu = {
  pricingFailure: (productName: string, detail: string): string =>
    `Árazási hiba (${productName}): ${detail}`,
  lengthMissing: (productName: string): string =>
    `A(z) "${productName}" méteráru — a hossz (cm) megadása kötelező.`,
  fieldDoesNotOfferValue: (fieldLabel: string, optionId: string): string =>
    `A(z) "${fieldLabel}" mező nem kínálja ezt az értéket: ${optionId}`,
  fieldDoesNotOfferMaterial: (fieldLabel: string, materialId: string): string =>
    `A(z) "${fieldLabel}" mező nem kínálja ezt az anyagot: ${materialId}`,
  fieldHasNoOptions: (fieldLabel: string): string =>
    `A(z) "${fieldLabel}" mezőnek nincs választható értéke.`,
  forbiddenCombination: (productName: string, materialIds: string): string =>
    `A(z) "${productName}" termék ebben az anyagkombinációban nem rendelhető: ${materialIds}.`,
  unknownField: (fieldId: string): string => `A termék nem ismeri ezt a mezőt: ${fieldId}`,
  selectionsNotJson: (): string => "A rendelési sor konfigurációja nem érvényes JSON.",
  selectionsInvalid: (issues: string): string =>
    `A rendelési sor konfigurációja érvénytelen: ${issues}`,
  selectionUnknownField: (productName: string, fieldId: string): string =>
    `A(z) "${productName}" termék nem ismeri ezt a mezőt: ${fieldId}`,
  selectionWrongKind: (productName: string, fieldLabel: string): string =>
    `A(z) "${productName}" "${fieldLabel}" mezőjének választása nem a mező fajtájának megfelelő.`,
  selectionInvalid: (productName: string, fieldLabel: string, reason: string): string =>
    `A(z) "${productName}" "${fieldLabel}" mezőjének választása érvénytelen: ${reason}.`,
  reasonUnknownMaterial: (): string => "ismeretlen anyagot tartalmaz",
  reasonForeignColor: (): string => "az anyag által nem kínált színt tartalmaz",
  reasonTooFewColors: (required: number): string => `legalább ${required} színt kell választani`,
  reasonTextTooLong: (subject: string, maxLength: number): string =>
    `${subject} legfeljebb ${maxLength} karakter lehet`,
  reasonBadFormat: (subject: string): string => `${subject} formátuma érvénytelen`,
  reasonUnofferedValue: (): string => "nem kínált értéket tartalmaz",
  reasonCustomNotAccepted: (): string => "egyedi értéket nem fogad el",
  subjectText: (): string => "a szöveg",
  subjectValue: (): string => "az érték",
  variantUnavailable: (productName: string): string =>
    `A(z) ${productName} kiválasztott változata már nem elérhető.`,
  defaultProductName: (): string => "A termék",
  unknownThreadColor: (colorIds: string): string => `Ismeretlen hímzőcérna-szín: ${colorIds}.`,
  checkoutMissing: (missing: string): string => `A rendelés nem adható le, hiányzik: ${missing}.`,
  checkoutMissingLine: (): string => "legalább egy termék",
  checkoutMissingCustomer: (): string => "a vevő adatai",
  checkoutMissingShippingMethod: (): string => "a szállítási mód",
  checkoutMissingAddress: (): string => "a szállítási cím",
  checkoutMissingTerms: (): string => "az ÁSZF elfogadása",
  detailLength: (): string => "Hossz",
  detailCustom: (value: string): string => `Egyedi: ${value}`,
  detailToggleOff: (): string => "Nem",
  detailToggleOn: (): string => "Igen",
  deliveryFree: (): string => "ingyenes",
  productOrdinal: (number: number): string => `${number}. termék`,
  orderConfirmationSubject: (orderCode: string): string => `Köszönjük a rendelésed: ${orderCode}`,
  orderNotificationSubject: (orderCode: string): string => `Új árajánlatkérés: ${orderCode}`,
};

type Messages = typeof hu;

const en: Messages = {
  pricingFailure: (productName, detail) => `Pricing failure (${productName}): ${detail}`,
  lengthMissing: (productName) =>
    `The "${productName}" fabric product requires a length in centimetres.`,
  fieldDoesNotOfferValue: (fieldLabel, optionId) =>
    `The "${fieldLabel}" field does not offer this value: ${optionId}`,
  fieldDoesNotOfferMaterial: (fieldLabel, materialId) =>
    `The "${fieldLabel}" field does not offer this material: ${materialId}`,
  fieldHasNoOptions: (fieldLabel) => `The "${fieldLabel}" field has no selectable options.`,
  forbiddenCombination: (productName, materialIds) =>
    `The "${productName}" product cannot be ordered in this material combination: ${materialIds}.`,
  unknownField: (fieldId) => `The product does not know this field: ${fieldId}`,
  selectionsNotJson: () => "The order line configuration is not valid JSON.",
  selectionsInvalid: (issues) => `The order line configuration is invalid: ${issues}`,
  selectionUnknownField: (productName, fieldId) =>
    `The "${productName}" product does not know this field: ${fieldId}`,
  selectionWrongKind: (productName, fieldLabel) =>
    `The "${fieldLabel}" field of "${productName}" has a choice that does not match the field's kind.`,
  selectionInvalid: (productName, fieldLabel, reason) =>
    `The "${fieldLabel}" field of "${productName}" has an invalid choice: ${reason}.`,
  reasonUnknownMaterial: () => "contains an unknown material",
  reasonForeignColor: () => "contains a colour the material does not offer",
  reasonTooFewColors: (required) => `at least ${required} colours must be chosen`,
  reasonTextTooLong: (subject, maxLength) => `${subject} can be at most ${maxLength} characters`,
  reasonBadFormat: (subject) => `${subject} has an invalid format`,
  reasonUnofferedValue: () => "contains a value that is not offered",
  reasonCustomNotAccepted: () => "does not accept a custom value",
  subjectText: () => "the text",
  subjectValue: () => "the value",
  variantUnavailable: (productName) =>
    `The selected variant of ${productName} is no longer available.`,
  defaultProductName: () => "The product",
  unknownThreadColor: (colorIds) => `Unknown embroidery thread colour: ${colorIds}.`,
  checkoutMissing: (missing) => `The order cannot be submitted, missing: ${missing}.`,
  checkoutMissingLine: () => "at least one product",
  checkoutMissingCustomer: () => "the customer details",
  checkoutMissingShippingMethod: () => "the delivery method",
  checkoutMissingAddress: () => "the delivery address",
  checkoutMissingTerms: () => "the acceptance of the terms",
  detailLength: () => "Length",
  detailCustom: (value) => `Custom: ${value}`,
  detailToggleOff: () => "No",
  detailToggleOn: () => "Yes",
  deliveryFree: () => "free",
  productOrdinal: (number) => `product ${number}`,
  orderConfirmationSubject: (orderCode) => `Thank you for your order: ${orderCode}`,
  orderNotificationSubject: (orderCode) => `New quote request: ${orderCode}`,
};

const TABLE: Record<MessageLanguage, Messages> = { hu, en };

export function messages(languageCode: string): Messages {
  return TABLE[messageLanguage(languageCode)];
}
