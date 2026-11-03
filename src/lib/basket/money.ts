function fractionDigits(currencyCode: string): number {
  return new Intl.NumberFormat("hu-HU", {
    style: "currency",
    currency: currencyCode,
  }).resolvedOptions().maximumFractionDigits;
}

export function majorUnits(amount: number, currencyCode: string): number {
  return amount / 10 ** fractionDigits(currencyCode);
}

export function formatMoney(amount: number, currencyCode: string): string {
  return new Intl.NumberFormat("hu-HU", { style: "currency", currency: currencyCode }).format(
    majorUnits(amount, currencyCode)
  );
}
