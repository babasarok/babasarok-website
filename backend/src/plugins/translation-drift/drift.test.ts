import { describe, expect, it } from "vitest";
import { parseDetail, translationDrifts, type AuditRowInput } from "./drift";

function row(
  overrides: Partial<AuditRowInput> & Pick<AuditRowInput, "id" | "details">
): AuditRowInput {
  return {
    entityType: "product",
    entityKey: "5",
    action: "updated",
    summary: "Kendő",
    createdAt: "2026-11-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("parseDetail", () => {
  it("maps the per-language audit labels to the canonical field keys", () => {
    expect(parseDetail("product", "Fordítás / hu / Név")).toEqual({
      language: "hu",
      field: "name",
      fieldLabel: "Név",
    });
    expect(parseDetail("product", "Fordítás / en / Rövid leírás")).toEqual({
      language: "en",
      field: "shortDescription",
      fieldLabel: "Rövid leírás",
    });
    expect(parseDetail("material", "Leírás (hu)")).toEqual({
      language: "hu",
      field: "description",
      fieldLabel: "Leírás",
    });
    expect(parseDetail("material", "Színek/minták / feher / Név (en)")).toEqual({
      language: "en",
      field: "colors.feher.label",
      fieldLabel: "Szín neve (feher)",
    });
    expect(parseDetail("product-definition", "Mezők / anyag / Címke (hu)")).toEqual({
      language: "hu",
      field: "fields.anyag.label",
      fieldLabel: "Definíció szöveg",
    });
    expect(
      parseDetail("product-definition", "Mezők / meret / Opciók / kicsi / Címke (en)")
    ).toEqual({
      language: "en",
      field: "fields.meret.options.kicsi.label",
      fieldLabel: "Definíció szöveg",
    });
    expect(parseDetail("promotion", "Név")).toEqual({
      language: "hu",
      field: "name",
      fieldLabel: "Név",
    });
  });

  it("ignores labels without per-language text", () => {
    expect(parseDetail("product", "Fordítás / hu / Webcím")).toBeNull();
    expect(parseDetail("product", "Rendelhető")).toBeNull();
    expect(parseDetail("material", "Színek/minták / feher / Megjelenés")).toBeNull();
    expect(parseDetail("product-definition", "Alapár")).toBeNull();
    expect(parseDetail("product-definition", "Név eltér: a → b")).toBeNull();
    expect(parseDetail("promotion", "Kedvezmény összege")).toBeNull();
  });
});

describe("translationDrifts", () => {
  it("reports a translation last changed before the Hungarian source", () => {
    const findings = translationDrifts([
      row({ id: 1, details: [{ field: "Fordítás / en / Név", from: "Kendő", to: "Scarf" }] }),
      row({
        id: 2,
        createdAt: "2026-11-02T10:00:00.000Z",
        details: [{ field: "Fordítás / hu / Név", from: "Kendő", to: "Sál" }],
      }),
    ]);

    expect(findings).toEqual([
      {
        entityType: "product",
        entityKey: "5",
        entityLabel: "Kendő",
        field: "name",
        fieldLabel: "Név",
        languageCode: "en",
        huFrom: "Kendő",
        huTo: "Sál",
        translatedValue: "Scarf",
        lastHuChangeAt: "2026-11-02T10:00:00.000Z",
        auditEntryId: 2,
      },
    ]);
  });

  it("stays silent when the translation changed last, or both changed in one save", () => {
    const enThenHu = [
      row({ id: 1, details: [{ field: "Fordítás / hu / Név", from: "Kendő", to: "Sál" }] }),
      row({ id: 2, details: [{ field: "Fordítás / en / Név", from: null, to: "Scarf" }] }),
    ];

    expect(translationDrifts(enThenHu)).toEqual([]);

    const sameSave = [
      row({
        id: 3,
        details: [
          { field: "Fordítás / hu / Név", from: "Kendő", to: "Sál" },
          { field: "Fordítás / en / Név", from: "Scarf", to: "Shawl" },
        ],
      }),
    ];

    expect(translationDrifts(sameSave)).toEqual([]);
  });

  it("stays silent when the new Hungarian text equals the recorded translation", () => {
    const findings = translationDrifts([
      row({ id: 1, details: [{ field: "Fordítás / en / Név", from: null, to: "Sál" }] }),
      row({ id: 2, details: [{ field: "Fordítás / hu / Név", from: "kendő ", to: "Sál" }] }),
    ]);

    expect(findings).toEqual([]);
  });

  it("ignores created, synced and detail-less rows", () => {
    const findings = translationDrifts([
      row({
        id: 1,
        action: "created",
        details: [{ field: "Fordítás / hu / Név", from: null, to: "Kendő" }],
      }),
      row({
        id: 2,
        action: "synced",
        details: [{ field: "Név eltér: a → b", from: "a", to: "b" }],
      }),
      row({ id: 3, details: null }),
    ]);

    expect(findings).toEqual([]);
  });

  it("tracks material color labels and definition field labels", () => {
    const findings = translationDrifts([
      row({
        entityType: "material",
        entityKey: "int-pamut",
        summary: "Pamut",
        id: 1,
        details: [{ field: "Színek/minták / feher / Név (en)", from: null, to: "White" }],
      }),
      row({
        entityType: "material",
        entityKey: "int-pamut",
        summary: "Pamut",
        id: 2,
        details: [{ field: "Színek/minták / feher / Név (hu)", from: "feher", to: "Fehér" }],
      }),
      row({
        entityType: "product-definition",
        entityKey: "int-takaro",
        summary: "Takaró",
        id: 3,
        details: [{ field: "Mezők / anyag / Címke (en)", from: null, to: "Material" }],
      }),
      row({
        entityType: "product-definition",
        entityKey: "int-takaro",
        summary: "Takaró",
        id: 4,
        details: [{ field: "Mezők / anyag / Címke (hu)", from: "Anyag", to: "Anyag választó" }],
      }),
    ]);

    expect(
      findings.map((finding) => [finding.field, finding.huTo, finding.translatedValue])
    ).toEqual([
      ["colors.feher.label", "Fehér", "White"],
      ["fields.anyag.label", "Anyag választó", "Material"],
    ]);
  });
});
