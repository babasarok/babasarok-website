import { expect, test, type Page } from "@playwright/test";
import { z } from "zod";
import { adminApi, ensureMaterials, login, SEED_MATERIALS } from "./helpers";

/**
 * Browser-level e2e for the dashboard's "Változásnapló" page (ADR 0015,
 * backend/src/dashboard/audit/audit.tsx), served by the site's Worker at
 * /dashboard (ADR 0008) against the API booted by
 * `pnpm -C backend run e2e:server`. A label-only material edit (no automatic
 * sync follows it) must appear as an attributable row, and the entity-type
 * filter must narrow the list.
 */

const MaterialsWithTexts = z.object({
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

const UpdatedMaterial = z.object({ updateMaterial: z.object({ slug: z.string() }) });

const MATERIALS_WITH_TEXTS = `query MaterialsAuditE2E {
  materials {
    id
    slug
    translations { languageCode label subtitle }
    colors {
      id
      hex
      translations { languageCode label }
    }
  }
}`;

const UPDATE_MATERIAL = `mutation UpdateMaterialAuditE2E($id: ID!, $input: MaterialInput!) {
  updateMaterial(id: $id, input: $input) { slug }
}`;

/** A subtitle-only edit: the sync reads labels and colors, so this is the
 * label-only case the audit log exists to capture (ADR 0015). */
async function renameMaterialSubtitle(page: Page): Promise<string> {
  const { materials } = await adminApi(page, MATERIALS_WITH_TEXTS, {}, MaterialsWithTexts);
  const pamut = materials.find((material) => material.slug === "e2e-pamut");

  if (pamut === undefined) {
    throw new Error("e2e-pamut was not seeded.");
  }

  await adminApi(
    page,
    UPDATE_MATERIAL,
    {
      id: pamut.id,
      input: {
        slug: pamut.slug,
        translations: pamut.translations.map((t) => ({
          ...t,
          subtitle: t.languageCode === "hu" ? "naplózott módosítás" : t.subtitle,
        })),
        colors: pamut.colors.map((c) => ({
          id: c.id,
          hex: c.hex ?? undefined,
          translations: c.translations.map((t) => ({ ...t })),
        })),
      },
    },
    UpdatedMaterial
  );

  return pamut.slug;
}

test("shows and filters the audit rows of catalog changes", async ({ page }) => {
  await login(page, "/materials");
  await ensureMaterials(page, SEED_MATERIALS);
  const slug = await renameMaterialSubtitle(page);

  await page.goto("/dashboard/audit-log");

  // The specs share one database, so earlier specs leave rows of their own;
  // the newest row for this material is the edit above.
  const row = page.getByRole("row").filter({ hasText: slug }).first();

  await expect(row).toContainText("Anyag");
  await expect(row).toContainText("módosítva");
  await expect(row).toContainText("admin@babasarok.local");

  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Termékdefiníció" }).click();

  await expect(page.getByRole("row").filter({ hasText: slug })).toHaveCount(0);
});
