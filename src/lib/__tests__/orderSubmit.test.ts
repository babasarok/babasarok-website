/**
 * Regression guard for the exact text sent to web3forms.
 *
 * These tests pin the *content* of the order strings (the per-product blocks and
 * the surrounding form fields) so any accidental change to wording, ordering, or
 * formatting in `orderSubmit.ts` shows up as a failing snapshot/assertion.
 *
 * We drive the real public entry point (`submitOrder`) with a stubbed `fetch`
 * and read back the `FormData` it would POST, rather than calling the private
 * formatter — that way the test also covers the field wiring (subject, name,
 * delivery, total, …), not just one helper.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { calculateOrderTotal, submitOrder, type OrderDetails } from "@/lib/orderSubmit";
import { makeDelivery, makeField, makeMaterial, makeProduct } from "./fixtures";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Run a successful submit and return the FormData that would have been POSTed. */
async function captureForm(
  order: OrderDetails,
  options?: { accessKey?: string; message?: string }
): Promise<FormData> {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  vi.stubGlobal("fetch", fetchMock);

  const result = await submitOrder(order, {
    accessKey: options?.accessKey ?? "TEST_KEY",
    message: options?.message ?? "",
  });
  expect(result).toEqual({ ok: true });

  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("https://api.web3forms.com/submit");
  expect(init.method).toBe("POST");
  return init.body as FormData;
}

const baseOrder = (products: OrderDetails["products"], address?: string): OrderDetails => ({
  name: "Teszt Elek",
  email: "teszt@example.com",
  phone: "+36301234567",
  deliveryMethod: makeDelivery("Foxpost automata", 990, "foxpost"),
  address,
  products,
  threadColors: [],
  productGroups: [],
});

describe("order form envelope", () => {
  it("includes contact, delivery, message, access key and total fields", async () => {
    const product = makeProduct({ title: "Pólya", price: 8000 });
    const form = await captureForm(baseOrder([product]), {
      accessKey: "SECRET_KEY",
      message: "Kérlek hímezzétek rá: Anna",
    });

    expect(form.get("access_key")).toBe("SECRET_KEY");
    expect(form.get("subject")).toBe("Új árajánlatkérés - Teszt Elek");
    expect(form.get("nev")).toBe("Teszt Elek");
    expect(form.get("email")).toBe("teszt@example.com");
    expect(form.get("telefonszam")).toBe("+36301234567");
    expect(form.get("szallitasimod")).toBe("Foxpost automata (990 Ft)");
    expect(form.get("uzenet")).toBe("Kérlek hímezzétek rá: Anna");
    expect(form.get("ar")).toBe("8990 Ft");
  });

  it("emits one `termek N` entry per product, in order", async () => {
    const form = await captureForm(
      baseOrder([
        makeProduct({ title: "Első", price: 1000 }),
        makeProduct({ title: "Második", price: 2000 }),
      ])
    );

    expect(form.getAll("termek 1")).toHaveLength(1);
    expect(form.get("termek 1")).toContain("Első");
    expect(form.get("termek 2")).toContain("Második");
    expect(form.get("ar")).toBe("3990 Ft");
  });

  it("marks the total as indeterminate when any price is unknown", async () => {
    // An option with no price makes the total partial; the base price is always known.
    const product = makeProduct({
      title: "Ismeretlen árú",
      price: 0,
      fields: [
        makeField({
          name: "meret",
          label: "Méret",
          type: "radio",
          items: [{ value: "40x75", label: "Közepes" }],
          value: { value: "40x75" },
        }),
      ],
    });
    const form = await captureForm(baseOrder([product]));
    expect(form.get("ar")).toBe("990 Ft (nem teljes ár)");
  });
});

describe("product string content", () => {
  it("formats a radio + toggle product with materials", async () => {
    const product = makeProduct({
      title: "Babafészek",
      count: 2,
      price: 15_000,
      fields: [
        makeField({
          name: "meret",
          label: "Méret",
          type: "radio",
          items: [
            { value: "35x65", label: "Normál", price: 0 },
            { value: "40x75", label: "Közepes", price: 1500 },
            { value: "50x90", label: "XXL", price: 5000 },
          ],
          value: { value: "40x75" },
        }),
        makeField({
          name: "takaro",
          label: "Babatakaró és párna",
          type: "toggle",
          price: 6500,
          value: { value: true },
        }),
        makeField({
          name: "betet",
          label: "Betét",
          type: "toggle",
          price: 3700,
          value: { value: false },
        }),
      ],
      materials: [
        makeMaterial({
          material_id: "teddy",
          label: "Teddy",
          price: 2000,
          colors: [
            { color_id: "bezs", label: "Bézs" },
            { color_id: "szurke", label: "Szürke" },
          ],
        }),
        makeMaterial({
          material_id: "minky",
          label: "Minky",
          price: 2500,
          colors: [{ color_id: "rozsa", label: "Rózsaszín" }],
        }),
      ],
      material_required_count: 2,
      values: [
        { material_id: "teddy", colors: ["bezs", "szurke"] },
        { material_id: "minky", colors: ["rozsa"] },
      ],
    });

    expect(form_text(await captureForm(baseOrder([product])))).toMatchInlineSnapshot(`
      "Babafészek (2db)
        Méret: Közepes
        Babatakaró és párna: Igen
        Betét: Nem
        Anyagok:
          1. Teddy (Bézs, Szürke)
          2. Minky (Rózsaszín)

      Alapár: 15000 Ft
      Méret: 1500Ft
      Babatakaró és párna: 6500Ft
      Betét: 0Ft
      Anyag 1: 2000Ft
      Anyag 2: 2500Ft

        Egységár: 27500Ft
      Összár: 55000Ft"
    `);
  });

  it("marks a custom (Egyéb) field value with an 'Egyedi:' prefix", async () => {
    const product = makeProduct({
      title: "Baldachin",
      price: 12_000,
      fields: [
        makeField({
          name: "szin",
          label: "Szín",
          type: "color",
          allow_custom_value: true,
          value: { value: "mályva", is_custom: true },
        }),
      ],
    });

    expect(form_text(await captureForm(baseOrder([product])))).toMatchInlineSnapshot(`
      "Baldachin (1db)
        Szín: Egyedi: mályva

      Alapár: 12000 Ft
      Szín: ??Ft

        Egységár: 12000Ft
      Összár: 12000Ft (nem teljes ár)"
    `);
  });

  it("includes delivery address when needed", async () => {
    const product = makeProduct({ title: "Pólya", price: 8000 });

    const form = await captureForm({
      ...baseOrder([product]),
      deliveryMethod: makeDelivery("GLS házhozszállítás", 1390, "gls", true),
      address: "1234 Budapest, Kossuth Lajos utca 12.",
    });
    expect(form.get("szallitasicim")).toBe("1234 Budapest, Kossuth Lajos utca 12.");

    // needs_address false → field must be absent
    const formWithoutAddress = await captureForm({
      ...baseOrder([product]),
      deliveryMethod: makeDelivery("Személyes átvétel", 0, "szemelyes"),
      address: "1234 Budapest, Kossuth Lajos utca 12.",
    });
    expect(formWithoutAddress.get("szallitasicim")).toBeNull();
  });

  it("includes filled-in optional fields but still hides empty ones", async () => {
    const product = makeProduct({
      title: "Cumilánc",
      price: 3500,
      fields: [
        makeField({ name: "nev", label: "Név", type: "input", price: 0, value: { value: "Anna" } }),
        makeField({
          name: "egyeb",
          label: "Egyéb megjegyzés",
          type: "input",
          optional: true,
          price: 0,
          value: { value: "Sürgős, kérlek!" },
        }),
        makeField({
          name: "ures",
          label: "Üres megjegyzés",
          type: "input",
          optional: true,
          price: 0,
        }),
      ],
    });

    const text = form_text(await captureForm(baseOrder([product])));
    expect(text).toContain("  Név: Anna");
    // The filled-in optional note now reaches the email's answers block …
    expect(text).toContain("  Egyéb megjegyzés: Sürgős, kérlek!");
    // … while an empty optional field stays out of the answers block (the
    // 2-space indent distinguishes answer lines from the price breakdown).
    expect(text).not.toContain("  Üres megjegyzés:");
  });

  it("renders a length-priced (méteráru) product", async () => {
    const product = makeProduct({
      title: "Fonott rácsvédő",
      price: 0,
      length_based_pricing: { sourceField: "sizes" },
      fields: [
        makeField({
          name: "sizes",
          label: "Méret",
          type: "radio",
          items: [
            { value: "200", label: "200cm" },
            { value: "300", label: "300cm" },
          ],
          value: { value: "300" },
        }),
        makeField({
          name: "fonas",
          label: "Fonás",
          type: "radio",
          items: [
            { value: "3", label: "Hármas", price: 6400 },
            { value: "4", label: "Négyes", price: 8000 },
          ],
          value: { value: "4" },
        }),
      ],
      materials: [
        makeMaterial({
          material_id: "pamutjersey",
          label: "Pamutjersey",
          price: 0,
          color_count: "fonas",
          colors: [
            { color_id: "feher", label: "Fehér" },
            { color_id: "kek", label: "Kék" },
            { color_id: "zold", label: "Zöld" },
            { color_id: "piros", label: "Piros" },
          ],
        }),
      ],
      material_required_count: 1,
      values: [{ material_id: "pamutjersey", colors: ["feher", "kek", "zold", "piros"] }],
    });

    expect(form_text(await captureForm(baseOrder([product])))).toMatchInlineSnapshot(`
      "Fonott rácsvédő (1db)
        Méret: 300cm
        Fonás: Négyes
        Anyagok:
          1. Pamutjersey (Fehér, Kék, Zöld, Piros)

      Alapár: 0 Ft
      Fonás: 8000Ft
      Anyag: 0Ft

        Egységár: 24000Ft
        Méterár: 8000Ft/m
      Összár: 24000Ft"
    `);
  });

  it("renders a custom material colour as 'Egyedi szín'", async () => {
    const product = makeProduct({
      title: "Babafészek",
      price: 15_000,
      fields: [],
      materials: [makeMaterial({ material_id: "teddy", label: "Teddy", price: 2000 })],
      material_required_count: 1,
      values: [{ material_id: "teddy", colors: [], custom_color: "Mályva pöttyös" }],
    });

    expect(form_text(await captureForm(baseOrder([product])))).toMatchInlineSnapshot(`
      "Babafészek (1db)
        Anyagok:
          1. Teddy (Egyedi szín: Mályva pöttyös)

      Alapár: 15000 Ft
      Anyag: 2000Ft

        Egységár: 17000Ft
      Összár: 17000Ft"
    `);
  });

  it("renders enabled embroidery with thread color label and omits disabled embroidery", async () => {
    const product = makeProduct({
      title: "Pólya",
      price: 8000,
      fields: [
        makeField({
          name: "himzes",
          label: "Hímzés",
          type: "embroidery",
          price: 1500,
          value: { enabled: true, text: { value: "Anna" }, color: { color: "ekru" } },
        }),
        makeField({
          name: "masik_himzes",
          label: "Másik hímzés",
          type: "embroidery",
          price: 1500,
          value: { enabled: false, text: { value: "Bori" }, color: { color: "fekete" } },
        }),
      ],
    });

    const form = await captureForm({
      ...baseOrder([product]),
      threadColors: [
        { color_id: "ekru", label: "Ekrü" },
        { color_id: "fekete", label: "Fekete" },
      ],
    });
    const text = form_text(form);
    expect(text).toContain("  Hímzés: Anna (Ekrü)");
    expect(text).toContain("Hímzés: 1500Ft");
    expect(text).not.toContain("Másik hímzés");
    expect(text).not.toContain("Bori");
  });

  it("applies an active discount to the product total but not the line prices", async () => {
    const product = makeProduct({
      title: "Akciós pólya",
      price: 10_000,
      count: 2,
      discount: 20,
      discount_valid_until: "2999-01-01",
    });

    const text = form_text(await captureForm(baseOrder([product])));
    expect(text).toContain("Alapár: 10000 Ft");
    // 10000 * 2 * 0.8 = 16000
    expect(text).toContain("Összár: 16000Ft");
  });
});

describe("dependent fields (depends_on)", () => {
  it("indents a dependent field one level below the field it depends on", async () => {
    const product = makeProduct({
      title: "Babafészek",
      price: 15_000,
      fields: [
        makeField({
          name: "himzes",
          label: "Hímzés",
          type: "toggle",
          value: { value: true },
        }),
        makeField({
          name: "himzes_szoveg",
          label: "Hímzés szövege",
          type: "input",
          value: { value: "Anna" },
          depends_on: { field: "himzes", value: "true" },
        }),
      ],
    });

    const text = form_text(await captureForm(baseOrder([product])));
    // Parent stays at the normal 2-space indent, the dependent field gets 4.
    expect(text).toContain("  Hímzés: Igen");
    expect(text).toContain("    Hímzés szövege: Anna");
  });

  it("indents a chained dependency two levels deep", async () => {
    const product = makeProduct({
      title: "Babafészek",
      price: 15_000,
      fields: [
        makeField({ name: "a", label: "A", type: "toggle", value: { value: true } }),
        makeField({
          name: "b",
          label: "B",
          type: "toggle",
          value: { value: true },
          depends_on: { field: "a", value: "true" },
        }),
        makeField({
          name: "c",
          label: "C",
          type: "input",
          value: { value: "mély" },
          depends_on: { field: "b", value: "true" },
        }),
      ],
    });

    const text = form_text(await captureForm(baseOrder([product])));
    expect(text).toContain("  A: Igen");
    expect(text).toContain("    B: Igen");
    expect(text).toContain("      C: mély");
  });

  it("omits a dependent field whose dependency is not fulfilled", async () => {
    const product = makeProduct({
      title: "Babafészek",
      price: 15_000,
      fields: [
        makeField({
          name: "himzes",
          label: "Hímzés",
          type: "toggle",
          value: { value: false },
        }),
        makeField({
          name: "himzes_szoveg",
          label: "Hímzés szövege",
          type: "input",
          value: { value: "Anna" },
          depends_on: { field: "himzes", value: "true" },
        }),
      ],
    });

    const text = form_text(await captureForm(baseOrder([product])));
    expect(text).toContain("Hímzés: Nem");
    // The dependency (Hímzés = Igen) is unmet, so the field must not appear —
    // not even its filled-in value.
    expect(text).not.toContain("Hímzés szövege");
    expect(text).not.toContain("Anna");
  });
});

describe("set-discount summary", () => {
  const setGroups = [
    {
      title: "Babafészek",
      discount_percent: 10,
      products: [{ product_id: "nest" }, { product_id: "blanket" }],
    },
  ];
  const withMaterial = (
    uuid: string,
    product_id: string,
    title: string
  ): ReturnType<typeof makeProduct> =>
    makeProduct({
      uuid,
      product_id,
      title,
      price: 10_000,
      values: [{ material_id: "cotton", colors: ["red"] }],
    });

  it("identifies each set member by its order number inside the ar field", async () => {
    const order = baseOrder([
      withMaterial("u1", "nest", "Babafészek"),
      withMaterial("u2", "blanket", "Takaró"),
    ]);
    order.productGroups = setGroups;
    const form = await captureForm(order);
    const ar = form.get("ar");
    expect(ar).toContain("Szett kedvezmények:");
    expect(ar).toContain(
      "Babafészek szett (−10%): -2000 Ft [1. termék: Babafészek + 2. termék: Takaró]"
    );
  });

  it("omits the set section from ar when no set discount is earned", async () => {
    const order = baseOrder([withMaterial("u1", "nest", "Babafészek")]);
    order.productGroups = setGroups;
    const form = await captureForm(order);
    const ar = form.get("ar");
    expect(ar).not.toContain("Szett kedvezmények:");
    expect(form.get("szett kedvezmenyek")).toBeNull();
  });
});

describe("calculateOrderTotal", () => {
  it("sums product totals plus delivery and flags indeterminate prices", () => {
    const known = makeProduct({ price: 5000 });
    // An unpriced selected option leaves this product's total unknown.
    const unknown = makeProduct({
      price: 0,
      fields: [
        makeField({
          name: "opt",
          type: "radio",
          items: [{ value: "a", label: "A" }],
          value: { value: "a" },
        }),
      ],
    });

    expect(calculateOrderTotal([known], makeDelivery("x", 1000), new Map())).toEqual({
      total: 6000,
      indeterminate: false,
    });
    expect(calculateOrderTotal([known, unknown], makeDelivery("x", 1000), new Map())).toEqual({
      total: 6000,
      indeterminate: true,
    });
  });
});

/** Read the joined `termek N` blocks of a captured form for snapshotting. */
function form_text(form: FormData): string {
  return form
    .getAll("termek 1")
    .map((v) => (typeof v === "string" ? v : ""))
    .join("\n");
}
