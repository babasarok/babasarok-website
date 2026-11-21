/**
 * Seam: our MyGLS client vs the real MyGLS API (test environment only).
 * Hand-run, never in CI: `GLS_SMOKE=1 pnpm -C backend exec vitest run
 * src/plugins/gls/mygls-client.smoke.test.ts` with the TEST_MYGLS_HU_*
 * account in backend/.env. Every parcel it creates it deletes again.
 */
import { describe, expect, it } from "vitest";
import type { GlsClient, GlsParcelRequest } from "./gls-client";
import { glsClientFor, glsConfigFromEnv } from "./gls-config";

const enabled = process.env.GLS_SMOKE === "1";

const parcel: GlsParcelRequest = {
  clientReference: "SMOKE",
  content: "Babasarok API smoke test",
  pickupAddress: {
    name: "Babasarok Teszt",
    street: "Fő utca",
    houseNumber: "1",
    city: "Telkibánya",
    zipCode: "3896",
    countryCode: "HU",
    contactPhone: "+36301234567",
  },
  deliveryAddress: {
    name: "Teszt Címzett",
    street: "Váci utca",
    houseNumber: "10",
    houseNumberInfo: "2. emelet",
    city: "Budapest",
    zipCode: "1052",
    countryCode: "HU",
    contactName: "Teszt Címzett",
    contactPhone: "+36301234567",
    contactEmail: "cimzett@example.com",
  },
};

function testEnvironmentClient(): GlsClient {
  process.loadEnvFile(".env");

  const config = glsConfigFromEnv(process.env, false);

  if (config.mode !== "test") {
    throw new Error("GLS smoke test needs TEST_MYGLS_HU_* in backend/.env");
  }

  return glsClientFor(config);
}

describe.skipIf(!enabled)("MyGLS test environment", () => {
  it.each([
    ["a prepaid parcel", undefined],
    ["a cash-on-delivery parcel", { amount: 12_345, reference: "SMOKE", currency: "HUF" }],
  ])("creates and deletes %s", async (_, cashOnDelivery) => {
    const client = testEnvironmentClient();
    const label = await client.createLabel({ ...parcel, cashOnDelivery });

    try {
      expect(label.parcelNumber).toBeGreaterThan(0);
      expect(new TextDecoder().decode(label.pdf.slice(0, 5))).toBe("%PDF-");
    } finally {
      await client.deleteLabel(label.parcelId);
    }

    await expect(client.deleteLabel(label.parcelId)).rejects.toMatchObject({
      failure: { kind: "rejected", errors: [{ code: 4 }] },
    });
  });
});
