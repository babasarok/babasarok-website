// Delivery-method names are authored as inline markdown on the site; the
// emails style the name themselves, so only the text is kept.
export function plainDeliveryName(name: string): string {
  return name.replaceAll(/(\*\*|__)(.+?)\1/g, "$2");
}
