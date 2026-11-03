// Vendure stores HUF amounts as plain forints, but ISO 4217 still gives HUF
// a 2-digit minor unit (the obsolete fillér), and some ICU builds follow it
// — dividing every checkout amount by 100 in those browsers. Pin HUF to 0
// digits; other currencies keep their Intl-resolved digits (EUR needs 2).
const PINNED_DIGITS: Record<string, number> = { HUF: 0 };

function fractionDigits(currencyCode: string): number {
  return (
    PINNED_DIGITS[currencyCode] ??
    new Intl.NumberFormat("hu-HU", {
      style: "currency",
      currency: currencyCode,
    }).resolvedOptions().maximumFractionDigits ??
    2
  );
}

export function majorUnits(amount: number, currencyCode: string): number {
  return amount / 10 ** fractionDigits(currencyCode);
}

export function formatMoney(amount: number, currencyCode: string): string {
  return new Intl.NumberFormat("hu-HU", { style: "currency", currency: currencyCode }).format(
    majorUnits(amount, currencyCode)
  );
}
