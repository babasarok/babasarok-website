/**
 * Order submission: turn the readable order data into the web3forms payload
 * and POST it. Kept out of the Svelte component so the form stays declarative.
 */
import type { OrderEmailData, ReadableProductData } from "./emailConverter";

const WEB3FORMS_ENDPOINT = "https://api.web3forms.com/submit";

/** Render a single product into the plain-text block used in the email body. */
function formatProductString(p: ReadableProductData): string {
  let result = p.név;
  result += ` (${p.darabszám.toString()}db)`;
  result += `\n`;
  if (p.opciók && p.opciók.length > 0) {
    for (const option of p.opciók) {
      result += `  ${option.név}: ${option.érték}\n`;
    }
  }
  if (p.anyagok && p.anyagok.length > 0) {
    result += `  Anyagok:\n`;
    for (const material of p.anyagok) {
      result += `    - ${material.név} (${material.egyedi_szín ? `Egyedi szín: ${material.egyedi_szín}` : (material.színek?.join(", ") ?? "")})\n`;
    }
  }

  result += "\n";
  result += `Alapár: ${p.ár.alapár?.toString() ?? ""} Ft\n`;
  if (p.ár.tételek.length > 0) {
    for (const tétel of p.ár.tételek) {
      result += `${tétel.tétel}: ${tétel.ár?.toString() ?? "??"}Ft \n`;
    }
  }
  result += "\n";
  result += `${p.ár.egységár ? `  Egységár: ${p.ár.egységár.toString()}Ft` : ""}\n`;
  if (p.ár.hossz_alapú) {
    result += `  Méterár: ${p.ár.méterár?.toString() ?? ""}Ft/m\n`;
  }
  result += `Összár: ${p.ár.összár?.toString() ?? ""}Ft ${p.ár.nem_teljes_ár ? "(nem teljes ár)" : ""}`;

  return result;
}

function buildOrderFormData(data: OrderEmailData, accessKey: string, message: string): FormData {
  const formData = new FormData();
  formData.append("access_key", accessKey);
  formData.append("subject", `Új árajánlatkérés - ${data.név}`);
  formData.append("nev", data.név);
  formData.append("email", data.email);
  formData.append("telefonszam", data.telefonszám);
  for (const [index, product] of data.termékek.entries()) {
    formData.append(`termek ${(index + 1).toString()}`, formatProductString(product));
  }
  formData.append(
    "szallitasimod",
    `${data.szállítási_mód.név} (${data.szállítási_mód.ár.toString()} Ft)`
  );
  formData.append("uzenet", message);
  formData.append(
    "ar",
    `${data.ár.összár.toString()} Ft ${data.ár.nem_teljes_ár ? "(nem teljes ár)" : ""}`
  );
  return formData;
}

export type SubmitOrderResult = { ok: true } | { ok: false; message: string };

const GENERIC_ERROR =
  "Hiba történt az árajánlatkérés elküldése közben. Kérlek, próbáld meg újra később.";

export async function submitOrder(
  data: OrderEmailData,
  options: { accessKey: string; message: string }
): Promise<SubmitOrderResult> {
  const formData = buildOrderFormData(data, options.accessKey, options.message);

  try {
    const res = await fetch(WEB3FORMS_ENDPOINT, { method: "POST", body: formData });
    const result = (await res.json()) as { message?: string } | null;

    if (!res.ok) {
      console.log("Failed to submit order", result);
      return { ok: false, message: `${GENERIC_ERROR} (${result?.message ?? "Ismeretlen hiba"})` };
    }
  } catch (e) {
    console.log("Failed to submit order", e);
    return { ok: false, message: GENERIC_ERROR };
  }

  return { ok: true };
}
