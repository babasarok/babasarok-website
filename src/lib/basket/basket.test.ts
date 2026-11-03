import { describe, expect, it, vi } from "vitest";
import { ProductDefinitionSchema } from "@babasarok/product-definition";
import { makeField } from "../__tests__/fixtures";
import type { Field } from "@/lib/types.svelte";
import { createBasketApi, type BasketApi, type Result } from "./api";
import { applySelections, buildLine, buildSelections } from "./lineInput";
import { describeLine } from "./lineRows";
import { formatMoney, majorUnits } from "./money";
import { checkoutBlocker } from "./readiness";
import type { Order, OrderLine, ShippingQuote } from "./schemas";
import { loadShownPrices, priceChange, rememberShownPrice } from "./stale";
import {
  SetDiscountSchema,
  lineSetState,
  partnerLinks,
  setMembersByGroup,
  setSection,
} from "./setDiscounts";
import { isTokenRejection, loadActiveOrder } from "./tokenRejection";
import { placeOrder, splitName, type SubmitInput } from "./submit";

const definition = ProductDefinitionSchema.parse({
  id: "parna",
  orderable: true,
  basePrice: 9000,
  pricing: { kind: "unit" },
  forbiddenMaterialCombinations: [],
  fields: [
    {
      kind: "choice",
      id: "meret",
      label: { hu: "Méret" },
      presentation: "radio",
      visibility: { kind: "always" },
      options: [
        { id: "40", label: { hu: "40x40" }, price: 0 },
        { id: "50", label: { hu: "50x50" }, price: 2000 },
      ],
    },
    {
      kind: "toggle",
      id: "fodor",
      label: { hu: "Fodorral" },
      visibility: { kind: "always" },
      price: 1800,
    },
  ],
});

const variants = [
  {
    id: "1",
    options: [
      { group: "meret", code: "40" },
      { group: "fodor", code: "nem" },
    ],
  },
  {
    id: "2",
    options: [
      { group: "meret", code: "50" },
      { group: "fodor", code: "nem" },
    ],
  },
  {
    id: "3",
    options: [
      { group: "meret", code: "50" },
      { group: "fodor", code: "igen" },
    ],
  },
];

const fields = (): Field[] => [
  makeField({ name: "meret", type: "radio", value: { value: "50" } }),
  makeField({ name: "fodor", type: "toggle", value: { value: true } }),
];

describe("line input", () => {
  it("picks the variant matching the variant axes and records every selection", () => {
    const built = buildLine(definition, fields(), variants);

    expect(built).toEqual({
      ok: true,
      line: {
        variantId: "3",
        selections: JSON.stringify({
          meret: { kind: "option", value: "50" },
          fodor: { kind: "option", value: "igen" },
        }),
        lengthCm: undefined,
      },
    });
  });

  it("refuses a combination without a variant", () => {
    expect(buildLine(definition, fields(), variants.slice(0, 2)).ok).toBe(false);
  });

  it("round-trips selections back onto the fields", () => {
    const restored = [
      makeField({ name: "meret", type: "radio" }),
      makeField({ name: "fodor", type: "toggle" }),
    ];

    applySelections(restored, buildSelections(fields()));

    expect(buildSelections(restored)).toEqual(buildSelections(fields()));
  });
});

describe("line rows", () => {
  it("labels selections from the definition", () => {
    const rows = describeLine(definition, JSON.stringify(buildSelections(fields())), {
      materials: {},
      threadColors: {},
    });

    expect(rows).toEqual([
      { label: "Méret", value: "50x50" },
      { label: "Fodorral", value: "Igen" },
    ]);
  });

  it("returns no rows for unreadable selections", () => {
    expect(describeLine(definition, "nope", { materials: {}, threadColors: {} })).toEqual([]);
  });
});

describe("money", () => {
  it("reads forint amounts as whole units", () => {
    expect(majorUnits(2500, "HUF")).toBe(2500);
    expect(formatMoney(2500, "HUF")).toMatch(/2\s?500\s?Ft/);
  });
});

const line = (over: Partial<OrderLine> = {}): OrderLine => ({
  id: "10",
  quantity: 1,
  unitPriceWithTax: 11_000,
  discountedLinePriceWithTax: 11_000,
  customFields: null,
  invalidReason: null,
  productVariant: {
    id: "3",
    name: "v",
    product: { slug: "parna", name: "Párna", featuredAsset: null, productDefinition: null },
  },
  ...over,
});

const order = (lines: OrderLine[]): Order => ({
  id: "1",
  code: "ABC",
  state: "AddingItems",
  currencyCode: "HUF",
  totalQuantity: lines.length,
  subTotalWithTax: 0,
  shippingWithTax: 0,
  totalWithTax: 0,
  discounts: [],
  shippingLines: [],
  customer: null,
  shippingAddress: null,
  customFields: null,
  lines,
});

const pickup: ShippingQuote = {
  id: "7",
  name: "Személyes",
  description: "",
  priceWithTax: 0,
  customFields: { requiresAddress: false },
};
const gls: ShippingQuote = { ...pickup, id: "8", customFields: { requiresAddress: true } };
const draft = {
  name: "A B",
  email: "a@b.hu",
  address: "",
  termsAccepted: true,
  shippingMethodId: "7",
};

describe("stale prices", () => {
  it("reports a line whose server price differs from the shown one", () => {
    expect(priceChange(line(), { "10": 10_000 })).toEqual({ shown: 10_000, actual: 11_000 });
    expect(priceChange(line(), { "10": 11_000 })).toBeUndefined();
    expect(priceChange(line(), {})).toBeUndefined();
  });

  it("remembers shown prices in the given storage and survives corrupt data", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };

    rememberShownPrice(storage, "10", 5);
    expect(loadShownPrices(storage)).toEqual({ "10": 5 });

    for (const key of store.keys()) {
      store.set(key, "{bad");
    }

    expect(loadShownPrices(storage)).toEqual({});
  });
});

describe("checkout readiness", () => {
  it("blocks on an empty basket, invalid lines and missing details, in order", () => {
    expect(checkoutBlocker(order([]), [pickup], draft)?.field).toBe("lines");
    expect(
      checkoutBlocker(
        order([line({ invalidReason: { code: "X", message: "m" } })]),
        [pickup],
        draft
      )?.field
    ).toBe("invalid");
    expect(checkoutBlocker(order([line()]), [pickup], { ...draft, name: " " })?.field).toBe("name");
    expect(
      checkoutBlocker(order([line()]), [pickup], { ...draft, termsAccepted: false })?.field
    ).toBe("terms");
    expect(
      checkoutBlocker(order([line()]), [pickup], { ...draft, shippingMethodId: "" })?.field
    ).toBe("method");
  });

  it("requires an address only for methods that need one", () => {
    expect(checkoutBlocker(order([line()]), [pickup], draft)).toBeUndefined();
    expect(
      checkoutBlocker(order([line()]), [gls], { ...draft, shippingMethodId: "8" })?.field
    ).toBe("address");
    expect(
      checkoutBlocker(order([line()]), [gls], { ...draft, shippingMethodId: "8", address: "x" })
    ).toBeUndefined();
  });
});

function fakeApi(failAt?: keyof BasketApi): { api: BasketApi; calls: string[] } {
  const calls: string[] = [];
  const result = (name: keyof BasketApi): Promise<Result<Order>> => {
    calls.push(name);

    if (name === failAt) {
      return Promise.resolve({ ok: false, failure: { reason: "nem megy", detail: "d" } });
    }

    return Promise.resolve({ ok: true, value: order([line()]) });
  };

  return {
    calls,
    api: {
      setCustomer: () => result("setCustomer"),
      setShippingAddress: () => result("setShippingAddress"),
      setShippingMethod: () => result("setShippingMethod"),
      setOrderCustomFields: () => result("setOrderCustomFields"),
      transitionToArrangingPayment: () => result("transitionToArrangingPayment"),
    } as unknown as BasketApi,
  };
}

const submitInput: SubmitInput = {
  name: "Kovács Anna",
  email: "a@b.hu",
  phone: "",
  address: "Cím 1",
  message: "",
  shippingMethod: gls,
  termsAccepted: true,
  transactionId: "12345678-aaaa",
};

describe("placeOrder", () => {
  it("runs the native sequence in order, address included when required", async () => {
    const { api, calls } = fakeApi();

    expect((await placeOrder(api, submitInput, vi.fn())).ok).toBe(true);
    expect(calls).toEqual([
      "setCustomer",
      "setShippingAddress",
      "setShippingMethod",
      "setOrderCustomFields",
      "transitionToArrangingPayment",
    ]);
  });

  it("skips the address for pickup and stops at the first failure with a reference", async () => {
    const pick = fakeApi("setShippingMethod");
    const report = vi.fn();
    const result = await placeOrder(pick.api, { ...submitInput, shippingMethod: pickup }, report);

    expect(pick.calls).toEqual(["setCustomer", "setShippingMethod"]);
    expect(result).toMatchObject({ ok: false, reference: "12345678" });
    expect(result.ok ? "" : result.message).toContain("nem megy, kód: 12345678");
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ reference: "12345678" }));
  });

  it("splits names surname first", () => {
    expect(splitName("Kovács Anna Mária")).toEqual({ lastName: "Kovács", firstName: "Anna Mária" });
    expect(splitName("Anna")).toEqual({ lastName: "", firstName: "Anna" });
  });
});

describe("createBasketApi", () => {
  function apiWith(
    body: unknown,
    headers: Record<string, string> = {}
  ): {
    api: BasketApi;
    fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
    token: () => string | null;
  } {
    let token: string | null = "old";
    const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(Response.json(body, { headers })));
    const api = createBasketApi({
      fetch: fetchMock,
      apiUrl: "http://x",
      languageCode: "hu",
      tokens: { get: () => token, set: (t) => void (token = t), clear: () => void (token = null) },
    });

    return { api, fetchMock, token: () => token };
  }

  it("translates the vendure defaults buyers can hit into Hungarian", async () => {
    const { api } = apiWith({
      data: {
        setCustomerForOrder: {
          __typename: "EmailAddressConflictError",
          errorCode: "EMAIL_ADDRESS_CONFLICT_ERROR",
          message: "The email address is not available.",
        },
      },
    });
    const result = await api.setCustomer({
      emailAddress: "regisztralt@example.com",
      firstName: "A",
      lastName: "B",
      phoneNumber: "",
    });

    expect(result).toMatchObject({
      ok: false,
      failure: {
        reason:
          "Ez az email cím már regisztrált fiókhoz tartozik. Kérlek, adj meg egy másik email címet.",
      },
    });
  });

  it("sends the bearer token, stores the issued one and prefers the interceptor message", async () => {
    const { api, fetchMock, token } = apiWith(
      {
        data: {
          addItemToOrder: {
            __typename: "OrderInterceptorError",
            message: "generic",
            interceptorError: "Magyar ok",
          },
        },
      },
      { "vendure-auth-token": "new" }
    );
    const result = await api.addItem({
      productVariantId: "1",
      quantity: 1,
      customFields: { selections: "{}" },
    });

    expect(result).toMatchObject({ ok: false, failure: { reason: "Magyar ok" } });
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get("authorization")).toBe(
      "Bearer old"
    );
    expect(token()).toBe("new");
  });

  it("reports malformed responses instead of throwing", async () => {
    const { api } = apiWith({ data: { activeOrder: { id: 1 } } });

    expect((await api.activeOrder()).ok).toBe(false);
  });
});

describe("set discount adapter", () => {
  const fixtureOrder = {
    ...order([
      line({
        id: "1",
        setState: {
          kind: "ACTIVE",
          groupId: "g",
          title: "Alap",
          coveredUnits: 2,
          materialSyncFromLineId: null,
        },
      }),
      line({
        id: "2",
        setState: {
          kind: "PENDING_MATERIAL",
          groupId: "g",
          title: "Alap",
          coveredUnits: 0,
          materialSyncFromLineId: "1",
        },
      }),
      line({
        id: "3",
        setState: {
          kind: "PENDING_PARTNER",
          groupId: "g",
          title: "Alap",
          coveredUnits: 0,
          materialSyncFromLineId: null,
        },
      }),
    ]),
    setDiscounts: [
      {
        groupId: "g",
        title: "Fészek szett",
        amount: -1000,
        lines: [
          { orderLineId: "1", units: 2 },
          { orderLineId: "9", units: 1 },
        ],
      },
    ],
  };

  it("lists set instances with their member lines, dropping unknown lines", () => {
    expect(setSection(fixtureOrder)).toEqual([
      {
        groupId: "g",
        title: "Fészek szett",
        amount: -1000,
        members: [{ lineId: "1", name: "Párna", units: 2 }],
      },
    ]);
  });

  it("renders no set section and no line state when the API has no set fields", () => {
    expect(setSection(order([line()]))).toEqual([]);
    expect(lineSetState(line())).toBeUndefined();
  });

  it("maps each line state kind", () => {
    const [active, material, partner] = fixtureOrder.lines.map(lineSetState);

    expect(active?.kind).toBe("active");
    expect(material).toMatchObject({ kind: "pending-material", syncFromLineId: "1" });
    expect(partner?.kind).toBe("pending-partner");
  });

  it("offers a pending-partner line the set's members that are not yet in the basket", () => {
    const members = setMembersByGroup(
      [
        { id: "g", kind: "set", productIds: ["a", "b", "c", "gone"] },
        { id: "rel", kind: "related", productIds: ["a", "z"] },
      ],
      [
        { slug: "parna", name: "Párna", definition: { id: "a" } },
        { slug: "takaro", name: "Takaró", definition: { id: "b" } },
        { slug: "kosar", name: "Kosár", definition: { id: "c" } },
      ]
    );
    const [active, , partner] = fixtureOrder.lines;

    expect(members).toEqual({
      g: [
        { slug: "parna", name: "Párna" },
        { slug: "takaro", name: "Takaró" },
        { slug: "kosar", name: "Kosár" },
      ],
    });
    expect(partnerLinks(partner, fixtureOrder, members)).toEqual([
      { slug: "takaro", name: "Takaró" },
      { slug: "kosar", name: "Kosár" },
    ]);
    expect(partnerLinks(active, fixtureOrder, members)).toEqual([]);
  });

  it("rejects set data of the wrong shape", () => {
    expect(SetDiscountSchema.safeParse({ groupId: "g" }).success).toBe(false);
  });
});

describe("rejected basket token", () => {
  it("only auth/session rejections count as a rejected token", () => {
    expect(isTokenRejection(200, ["FORBIDDEN"])).toBe(true);
    expect(isTokenRejection(200, ["UNAUTHORIZED"])).toBe(true);
    expect(isTokenRejection(401, [])).toBe(true);
    expect(isTokenRejection(503, [])).toBe(false);
    expect(isTokenRejection(200, ["INTERNAL_SERVER_ERROR"])).toBe(false);
  });

  it("discards the token and starts empty when the load is rejected", async () => {
    const discardToken = vi.fn();
    const load = await loadActiveOrder({
      activeOrder: () =>
        Promise.resolve({ ok: false, failure: { reason: "x", detail: "x", tokenRejected: true } }),
      discardToken,
    });

    expect(load).toEqual({ order: null, loadFailed: false });
    expect(discardToken).toHaveBeenCalledOnce();
  });

  it("keeps the token on transient failures", async () => {
    const discardToken = vi.fn();
    const load = await loadActiveOrder({
      activeOrder: () => Promise.resolve({ ok: false, failure: { reason: "x", detail: "x" } }),
      discardToken,
    });

    expect(load).toBeNull();
    expect(discardToken).not.toHaveBeenCalled();
  });
});
