/**
 * Seam: the catalog write path vs. the audit log (ADR 0015). An admin
 * mutation must leave exactly one attributable row per action — including the
 * label-only material edit the stock events miss, and the sync job whose
 * worker context carries no user (its actor rides the job data, captured at
 * enqueue time).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { materialField, seedCatalog, type Catalog } from "./fixtures";
import { run, startServer, type IntegrationServer } from "./harness";

const AUDIT_MATRIX = {
  id: "int-audit",
  basePrice: 1000,
  pricing: { kind: "unit" },
  forbiddenMaterialCombinations: [],
  fields: [materialField("anyag", "Anyag")],
} as const;

const CreatedSchema = z.object({
  createProductDefinition: z.object({ productId: z.string() }),
});

const SyncStateSchema = z.object({
  productDefinition: z.object({ syncState: z.string(), syncError: z.string().nullable() }),
});

const AuditEntrySchema = z.object({
  id: z.string(),
  action: z.string(),
  source: z.string(),
  entityType: z.string(),
  entityKey: z.string(),
  actorIdentifier: z.string().nullable(),
  summary: z.string().nullable(),
});

const AuditSchema = z.object({
  auditLogEntries: z.object({
    totalItems: z.number(),
    items: z.array(AuditEntrySchema),
  }),
});

const MaterialsSchema = z.object({
  materials: z.array(
    z.object({
      id: z.string(),
      slug: z.string(),
      translations: z.array(
        z.object({ languageCode: z.string(), label: z.string(), subtitle: z.string() })
      ),
      colors: z.array(
        z.object({
          id: z.string(),
          hex: z.string().nullable(),
          translations: z.array(z.object({ languageCode: z.string(), label: z.string() })),
        })
      ),
    })
  ),
});

const UpdatedMaterialSchema = z.object({ updateMaterial: z.object({ slug: z.string() }) });

const PromotionsSchema = z.object({
  promotions: z.object({
    items: z.array(
      z.object({
        id: z.string(),
        translations: z.array(z.object({ languageCode: z.string(), name: z.string() })),
      })
    ),
  }),
});

const UpdatedPromotionSchema = z.object({
  updatePromotion: z.object({
    id: z.string(),
    translations: z.array(z.object({ languageCode: z.string(), name: z.string() })),
  }),
});

let server: IntegrationServer;
let catalog: Catalog;
let productId: string;

async function waitForSync(): Promise<void> {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const { productDefinition } = await run(
      server.admin,
      `query($productId: String!) { productDefinition(productId: $productId) { syncState syncError } }`,
      { productId },
      SyncStateSchema
    );

    if (productDefinition.syncState === "failed") {
      throw new Error(`sync failed: ${productDefinition.syncError}`);
    }

    if (productDefinition.syncState === "synced") {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("the definition did not sync in time.");
}

async function auditEntries(
  entityType: string | null
): Promise<{ totalItems: number; items: Array<z.output<typeof AuditEntrySchema>> }> {
  const { auditLogEntries } = await run(
    server.admin,
    `query($options: AuditLogListOptions) {
      auditLogEntries(options: $options) {
        totalItems
        items { id action source entityType entityKey actorIdentifier summary }
      }
    }`,
    { options: { take: 100, entityType } },
    AuditSchema
  );

  return auditLogEntries;
}

/** The audit row lands right after the sync state flips; poll for it. */
async function waitForAuditRow(
  entityType: string,
  action: string
): Promise<z.output<typeof AuditEntrySchema>> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { items } = await auditEntries(entityType);
    const row = items.find((entry) => entry.action === action);

    if (row !== undefined) {
      return row;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`no ${entityType}/${action} audit row appeared in time.`);
}

beforeAll(async () => {
  server = await startServer();
  catalog = await seedCatalog(server);

  const created = await run(
    server.admin,
    `mutation($definition: JSON!, $name: String!) {
      createProductDefinition(definition: $definition, name: $name) { productId }
    }`,
    { definition: AUDIT_MATRIX, name: "Audit mátrix" },
    CreatedSchema
  );
  productId = created.createProductDefinition.productId;
  await waitForSync();
});

afterAll(async () => {
  await server.stop();
});

describe("the audit log over the admin write path", () => {
  it("records a definition create and attributes its sync completion to the same admin", async () => {
    const created = await waitForAuditRow("product-definition", "created");
    const synced = await waitForAuditRow("product-definition", "synced");

    expect(created.entityKey).toBe(productId);
    expect(created.summary).toBe("Audit mátrix");
    expect(created.source).toBe("admin");
    expect(created.actorIdentifier).not.toBeNull();
    expect(synced.source).toBe("sync");
    expect(synced.actorIdentifier).toBe(created.actorIdentifier);
  });

  it("records the label-only material edit the stock events miss", async () => {
    const { materials } = await run(
      server.admin,
      `query { materials { id slug translations { languageCode label subtitle } colors { id hex translations { languageCode label } } } }`,
      {},
      MaterialsSchema
    );
    const material = materials.find((m) => m.slug === "int-pamut");

    if (material === undefined) {
      throw new Error("int-pamut was not seeded.");
    }

    // A subtitle change is not variant-relevant (the sync reads labels and
    // colors only): no MaterialEvent fires, yet the log must see the edit.
    const input = {
      slug: material.slug,
      translations: material.translations.map((t) => ({
        ...t,
        subtitle: t.languageCode === "hu" ? `${t.subtitle} (módosítva)` : t.subtitle,
      })),
      colors: material.colors.map((c) => ({
        id: c.id,
        hex: c.hex ?? undefined,
        translations: c.translations.map((t) => ({ ...t })),
      })),
    };

    await run(
      server.admin,
      `mutation($id: ID!, $input: MaterialInput!) { updateMaterial(id: $id, input: $input) { slug } }`,
      { id: material.id, input },
      UpdatedMaterialSchema
    );

    const rows = await auditEntries("material");
    const row = rows.items.find(
      (entry) => entry.action === "updated" && entry.entityKey === "int-pamut"
    );

    expect(row).toBeDefined();
    expect(row?.source).toBe("admin");
    expect(row?.actorIdentifier).not.toBeNull();
  });

  it("records a set-promotion rename through the guarded stock mutation", async () => {
    const { promotions } = await run(
      server.admin,
      `query { promotions(options: { take: 10 }) { items { id translations { languageCode name } } } }`,
      {},
      PromotionsSchema
    );
    const alap = promotions.items.find((promotion) =>
      promotion.translations.some((t) => t.languageCode === "hu" && t.name === "Alap szett")
    );

    if (alap === undefined) {
      throw new Error("the seeded Alap szett promotion was not found.");
    }

    const parnaId = catalog.nativeIds.get("int-parna");
    const takaroId = catalog.nativeIds.get("int-takaro");

    if (parnaId === undefined || takaroId === undefined) {
      throw new Error("the set members were not seeded.");
    }

    const renamed = await run(
      server.admin,
      `mutation($input: UpdatePromotionInput!) {
        updatePromotion(input: $input) { __typename ... on Promotion { id translations { languageCode name } } }
      }`,
      {
        input: {
          id: alap.id,
          enabled: true,
          conditions: [
            {
              code: "babasarok-product-set-members",
              arguments: [{ name: "productIds", value: JSON.stringify([parnaId, takaroId]) }],
            },
          ],
          actions: [
            {
              code: "babasarok-product-set-discount",
              arguments: [{ name: "amount", value: "1500" }],
            },
          ],
          translations: [{ languageCode: "hu", name: "Alap szett (átnevezve)" }],
        },
      },
      UpdatedPromotionSchema
    );

    const row = await waitForAuditRow("promotion", "updated");

    expect(row.entityKey).toBe(renamed.updatePromotion.id);
    expect(row.summary).toBe("Alap szett (átnevezve)");
    expect(row.source).toBe("admin");
    expect(row.actorIdentifier).not.toBeNull();
  });
});
