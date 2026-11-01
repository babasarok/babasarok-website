/**
 * Regression guard for the exact order payload sent to the Vendure shop API.
 *
 * These tests pin the *content* of the submitted order (the per-product
 * configText blocks and the surrounding fields) so any accidental change to
 * wording, ordering, or formatting in `submit.ts` shows up as a failing
 * assertion.
 *
 * We drive the real public entry point (`submitOrder`) with a stubbed `fetch`
 * and read back the GraphQL input it would POST, rather than calling the
 * private formatter — that way the test also covers the field wiring (buyer,
 * delivery, total, set summary, …), not just one helper.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { submitOrder, type OrderDetails } from "@/lib/order/submit";
import { resolveBasketPricing } from "@/lib/pricing/setDiscount";
import { chargedDeliveryPrice, orderTotal } from "@/lib/order/total";
import {
  makeDelivery,
  makeField,
  makeMaterial,
  makeMaterialProduct,
  makeProduct,
} from "./fixtures";
import type { CmsEnhancedDeliveryMethod } from "@/lib/data";

type QuoteOrderInput = Record<string, unknown>;

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Run a successful submit and return the QuoteOrderInput that would be POSTed. */
async function captureInput(
  order: OrderDetails,
  options?: { message?: string; transactionId?: string }
): Promise<QuoteOrderInput> {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        data: { submitQuoteOrder: { __typename: "SubmitQuoteOrderSuccess", orderCode: "CODE" } },
      }),
  });
  vi.stubGlobal("fetch", fetchMock);

  const result = await submitOrder(order, {
    message: options?.message ?? "",
    transactionId: options?.transactionId ?? "TEST-TRANSACTION-ID",
  });
  expect(result).toEqual({ ok: true });

  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("http://localhost:4000/shop-api");
  expect(init.method).toBe("POST");
  const body = JSON.parse(init.body as string) as { variables: { input: QuoteOrderInput } };
  return body.variables.input;
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
  termsAccepted: true,
});

/** The joined per-product config text blocks of a captured input. */
function productTexts(input: QuoteOrderInput): string[] {
  return (input.products as Array<{ configText: string }>).map((p) => p.configText);
}

describe("order envelope", () => {
  it("includes buyer, delivery, message, terms, total and transaction id", async () => {
    const product = makeProduct({ title: "Pólya", price: 8000 });
    const input = await captureInput(baseOrder([product]), {
      message: "Kérlek hímezzétek rá: Anna",
    });

    expect(input.name).toBe("Teszt Elek");
    expect(input.email).toBe("teszt@example.com");
    expect(input.phone).toBe("+36301234567");
    expect(input.deliveryMethod).toBe("Foxpost automata");
    expect(input.deliveryPrice).toBe(990);
    expect(input.deliveryFree).toBe(false);
    expect(input.message).toBe("Kérlek hímezzétek rá: Anna");
    expect(input.totalPrice).toBe(8990);
    expect(input.termsAccepted).toBe(true);
    // The transaction id closes the payload so it can be matched against the
    // Google Ads conversion recorded for the same submission.
    expect(input.transactionId).toBe("TEST-TRANSACTION-ID");
    expect(Object.keys(input).at(-1)).toBe("transactionId");
  });

  it("emits one product entry per basket line, in order", async () => {
    const input = await captureInput(
      baseOrder([
        makeProduct({ title: "Első", price: 1000 }),
        makeProduct({ title: "Második", price: 2000 }),
      ])
    );

    const products = input.products as Array<{ title: string; count: number }>;
    expect(products).toHaveLength(2);
    expect(products[0]?.title).toBe("Első");
    expect(products[1]?.title).toBe("Második");
    expect(input.totalPrice).toBe(3990);
  });
});

describe("product string content", () => {
  it("formats a radio + toggle product with material fields", async () => {
    const materialPool = [
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
    ];
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
        makeField({
          name: "anyag1",
          label: "Anyag 1",
          type: "material",
          materials: materialPool,
          value: { material_id: "teddy", colors: ["bezs", "szurke"] },
        }),
        makeField({
          name: "anyag2",
          label: "Anyag 2",
          type: "material",
          materials: materialPool,
          value: { material_id: "minky", colors: ["rozsa"] },
        }),
      ],
    });

    expect(productTexts(await captureInput(baseOrder([product])))[0]).toMatchInlineSnapshot(`
      "Babafészek (2db)
        Méret: Közepes
        Babatakaró és párna: Igen
        Betét: Nem
        Anyag 1: Teddy (Bézs, Szürke)
        Anyag 2: Minky (Rózsaszín)

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

    expect(productTexts(await captureInput(baseOrder([product])))[0]).toMatchInlineSnapshot(`
      "Baldachin (1db)
        Szín: Egyedi: mályva

      Alapár: 12000 Ft
      Szín: ??Ft

        Egységár: 12000Ft
      Összár: 12000Ft"
    `);
  });

  it("carries the delivery address only when the method needs one", async () => {
    const product = makeProduct({ title: "Pólya", price: 8000 });

    const input = await captureInput({
      ...baseOrder([product]),
      deliveryMethod: makeDelivery("GLS házhozszállítás", 1390, "gls", true),
      address: "1234 Budapest, Kossuth Lajos utca 12.",
    });
    expect(input.needsAddress).toBe(true);
    expect(input.address).toBe("1234 Budapest, Kossuth Lajos utca 12.");

    // needs_address false → the address must be absent from the payload
    const inputWithoutAddress = await captureInput({
      ...baseOrder([product]),
      deliveryMethod: makeDelivery("Személyes átvétel", 0, "szemelyes"),
      address: "1234 Budapest, Kossuth Lajos utca 12.",
    });
    expect(inputWithoutAddress.needsAddress).toBe(false);
    expect(inputWithoutAddress.address).toBeUndefined();
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

    const text = productTexts(await captureInput(baseOrder([product])))[0];
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
        makeField({
          name: "anyag",
          label: "Anyag",
          type: "material",
          color_count: "fonas",
          materials: [
            makeMaterial({
              material_id: "pamutjersey",
              label: "Pamutjersey",
              price: 0,
              colors: [
                { color_id: "feher", label: "Fehér" },
                { color_id: "kek", label: "Kék" },
                { color_id: "zold", label: "Zöld" },
                { color_id: "piros", label: "Piros" },
              ],
            }),
          ],
          value: { material_id: "pamutjersey", colors: ["feher", "kek", "zold", "piros"] },
        }),
      ],
    });

    expect(productTexts(await captureInput(baseOrder([product])))[0]).toMatchInlineSnapshot(`
      "Fonott rácsvédő (1db)
        Méret: 300cm
        Fonás: Négyes
        Anyag: Pamutjersey (Fehér, Kék, Zöld, Piros)

      Alapár: 0 Ft
      Fonás: 8000Ft
      Anyag: 0Ft

        Egységár: 24000Ft
        Méterár: 8000Ft/m
      Összár: 24000Ft"
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

    const input = await captureInput({
      ...baseOrder([product]),
      threadColors: [
        { color_id: "ekru", label: "Ekrü", hex: undefined, image: undefined },
        { color_id: "fekete", label: "Fekete", hex: undefined, image: undefined },
      ],
    });
    const text = productTexts(input)[0];
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

    const input = await captureInput(baseOrder([product]));
    const text = productTexts(input)[0];
    expect(text).toContain("Alapár: 10000 Ft");
    // 20% off 20000 = 4000 Ft, recorded as both percent and forint.
    expect(text).toContain("Kedvezmény: 20% (-4000 Ft) (2 db)");
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

    const text = productTexts(await captureInput(baseOrder([product])))[0];
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

    const text = productTexts(await captureInput(baseOrder([product])))[0];
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

    const text = productTexts(await captureInput(baseOrder([product])))[0];
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
      discount_amount: 2000,
      products: [{ product_id: "nest" }, { product_id: "blanket" }],
    },
  ];
  const withMaterial = (
    uuid: string,
    product_id: string,
    title: string
  ): ReturnType<typeof makeMaterialProduct> =>
    makeMaterialProduct({
      uuid,
      product_id,
      title,
      price: 10_000,
      values: [{ material_id: "cotton", colors: ["red"] }],
    });

  it("identifies each set member by its order number inside the summary", async () => {
    const order = baseOrder([
      withMaterial("u1", "nest", "Babafészek"),
      withMaterial("u2", "blanket", "Takaró"),
    ]);
    order.productGroups = setGroups;
    const input = await captureInput(order);
    const summary = input.setDiscountSummary as string;
    expect(summary).toContain("Szett kedvezmények:");
    expect(summary).toContain(
      "Babafészek szett: -2000 Ft [1. termék: Babafészek + 2. termék: Takaró]"
    );
  });

  it("shows the nominal set amount when clamped to the covered subtotal", async () => {
    // Two 300 Ft members can only absorb 600 Ft of a 2000 Ft set discount.
    const cheapNest = makeMaterialProduct({
      uuid: "u1",
      product_id: "nest",
      title: "Babafészek",
      price: 300,
      values: [{ material_id: "cotton", colors: ["red"] }],
    });
    const cheapBlanket = makeMaterialProduct({
      uuid: "u2",
      product_id: "blanket",
      title: "Takaró",
      price: 300,
      values: [{ material_id: "cotton", colors: ["red"] }],
    });
    const order = baseOrder([cheapNest, cheapBlanket]);
    order.productGroups = setGroups;
    const input = await captureInput(order);
    expect(input.setDiscountSummary).toContain(
      "Babafészek szett: -600 Ft (szett kedvezmény: 2000 Ft) [1. termék: Babafészek + 2. termék: Takaró]"
    );
  });

  it("omits the set section when no set discount is earned", async () => {
    const order = baseOrder([withMaterial("u1", "nest", "Babafészek")]);
    order.productGroups = setGroups;
    const input = await captureInput(order);
    expect(input.setDiscountSummary).toBe("");
  });
});

describe("submitted total equals the shared order total (visible == charged)", () => {
  const setGroups = [
    {
      title: "Babafészek",
      discount_amount: 2000,
      products: [{ product_id: "nest" }, { product_id: "blanket" }],
    },
  ];
  const member = (
    uuid: string,
    product_id: string,
    price: number
  ): ReturnType<typeof makeMaterialProduct> =>
    makeMaterialProduct({
      uuid,
      product_id,
      title: product_id,
      price,
      values: [{ material_id: "cotton", colors: ["red"] }],
    });

  it("puts the same figure in totalPrice as orderTotal over the resolved basket pricing", async () => {
    const products = [member("u1", "nest", 10_000), member("u2", "blanket", 10_000)];
    const delivery = makeDelivery("Foxpost automata", 990, "foxpost");
    const order: OrderDetails = { ...baseOrder(products), deliveryMethod: delivery };
    order.productGroups = setGroups;

    // The number the checkout display path computes for the same basket.
    const expected = orderTotal(resolveBasketPricing(products, setGroups), delivery.price);
    // 20000 items - 2000 set discount + 990 delivery
    expect(expected).toBe(18_990);

    const input = await captureInput(order);
    expect(input.totalPrice).toBe(expected);
  });

  it("matches when the set discount is clamped to the covered subtotal", async () => {
    // Two 300 Ft members absorb only 600 Ft of the 2000 Ft set discount.
    const products = [member("u1", "nest", 300), member("u2", "blanket", 300)];
    const delivery = makeDelivery("Személyes átvétel", 0, "szemelyes");
    const order: OrderDetails = { ...baseOrder(products), deliveryMethod: delivery };
    order.productGroups = setGroups;

    const expected = orderTotal(resolveBasketPricing(products, setGroups), delivery.price);
    // 600 items - 600 set discount + 0 delivery
    expect(expected).toBe(0);

    const input = await captureInput(order);
    expect(input.totalPrice).toBe(expected);
  });
});

describe("free delivery above a threshold", () => {
  const gls = (free_above?: number): CmsEnhancedDeliveryMethod =>
    makeDelivery("GLS házhozszállítás", 2500, "gls", true, free_above);

  it("drops delivery to 0 when the products subtotal exceeds free_above", async () => {
    // Two 40k items -> 80k products subtotal, above the 60k threshold.
    const products = [makeProduct({ price: 40_000 }), makeProduct({ price: 40_000 })];
    const delivery = gls(60_000);
    const order: OrderDetails = { ...baseOrder(products), deliveryMethod: delivery };

    const input = await captureInput(order);
    // Total is the products subtotal with no delivery added.
    expect(input.totalPrice).toBe(80_000);
    // The shipping line reports free, not the nominal price.
    expect(input.deliveryFree).toBe(true);
  });

  it("still charges delivery when the products subtotal is at/below free_above", async () => {
    // A single 60k item -> 60k products subtotal, exactly at (not above) the threshold.
    const products = [makeProduct({ price: 60_000 })];
    const delivery = gls(60_000);
    const order: OrderDetails = { ...baseOrder(products), deliveryMethod: delivery };

    const input = await captureInput(order);
    expect(input.totalPrice).toBe(62_500);
    expect(input.deliveryFree).toBe(false);
    expect(input.deliveryPrice).toBe(2500);
  });

  it("judges the threshold on the discounted subtotal, not the raw items total", async () => {
    // Two 35k items (70k raw) with a 15k set discount -> 55k products subtotal.
    const setGroups = [
      {
        title: "Szett",
        discount_amount: 15_000,
        products: [{ product_id: "nest" }, { product_id: "blanket" }],
      },
    ];
    const products = [
      makeProduct({ uuid: "u1", product_id: "nest", price: 35_000 }),
      makeProduct({ uuid: "u2", product_id: "blanket", price: 35_000 }),
    ];
    const delivery = gls(60_000);
    const order: OrderDetails = {
      ...baseOrder(products),
      deliveryMethod: delivery,
      productGroups: setGroups,
    };

    // The raw 70k would be free, but the discounted 55k is below 60k -> charged.
    const pricing = resolveBasketPricing(products, setGroups);
    const expected = orderTotal(pricing, chargedDeliveryPrice(delivery, pricing));
    expect(expected).toBe(57_500);

    const input = await captureInput(order);
    expect(input.totalPrice).toBe(expected);
    expect(input.deliveryFree).toBe(false);
    expect(input.deliveryPrice).toBe(2500);
  });
});
