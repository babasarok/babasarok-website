import { z } from "zod";
import { isTokenRejection } from "./tokenRejection";
import { SET_LINE_FIELDS, SET_ORDER_FIELDS } from "./setDiscounts";
import {
  OrderSchema,
  ShippingQuoteSchema,
  ProductVariantIdsSchema,
  type Order,
  type ShippingQuote,
} from "./schemas";

export interface TokenStore {
  get(): string | null;
  set(token: string): void;
  clear(): void;
}

export interface BasketApiDeps {
  fetch: typeof fetch;
  apiUrl: string;
  /**
   * The shop-API language per request: the fixed catalog language or a
   * browser function reading the page's locale when the API outlives a
   * single page.
   */
  languageCode: string | (() => string);
  tokens: TokenStore;
}

export interface Failure {
  reason: string;
  detail: string;
  stack?: string | undefined;
  tokenRejected?: boolean;
}

export type Result<T> = { ok: true; value: T } | { ok: false; failure: Failure };

export interface LineInput {
  productVariantId: string;
  quantity: number;
  customFields: { selections: string; lengthCm?: number };
}

export interface CustomerInput {
  emailAddress: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
}

export interface OrderCustomFieldsInput {
  message?: string;
  termsAccepted?: boolean;
  taxNumber?: string;
  submissionTransactionId?: string;
}

/** The structured delivery/billing address; the house number rides streetLine2. */
export interface AddressInput {
  fullName?: string;
  phoneNumber?: string;
  company?: string;
  streetLine1: string;
  streetLine2?: string;
  postalCode?: string;
  city?: string;
  countryCode: string;
}

export interface BasketApi {
  activeOrder(): Promise<Result<Order | null>>;
  addItem(input: LineInput): Promise<Result<Order>>;
  adjustLine(orderLineId: string, quantity: number): Promise<Result<Order>>;
  removeLine(orderLineId: string): Promise<Result<Order>>;
  /** The id of the product's one variant, or undefined when it is not orderable. */
  productVariantId(slug: string): Promise<Result<string | undefined>>;
  eligibleShippingMethods(): Promise<Result<ShippingQuote[]>>;
  setCustomer(input: CustomerInput): Promise<Result<Order>>;
  setShippingAddress(input: AddressInput): Promise<Result<Order>>;
  setBillingAddress(input: AddressInput): Promise<Result<Order>>;
  unsetBillingAddress(): Promise<Result<Order>>;
  setShippingMethod(shippingMethodId: string): Promise<Result<Order>>;
  setOrderCustomFields(input: OrderCustomFieldsInput): Promise<Result<Order>>;
  transitionToArrangingPayment(): Promise<Result<Order>>;
}

const ORDER_FIELDS = `
  id code state currencyCode totalQuantity subTotalWithTax shippingWithTax totalWithTax
  discounts { description amountWithTax }
  ${SET_ORDER_FIELDS}
  customer { firstName lastName emailAddress phoneNumber }
  shippingAddress { fullName company streetLine1 streetLine2 postalCode city countryCode }
  billingAddress { fullName company streetLine1 streetLine2 postalCode city countryCode }
  customFields { message taxNumber }
  shippingLines { priceWithTax discountedPriceWithTax shippingMethod { id } }
  lines {
    id quantity unitPriceWithTax discountedLinePriceWithTax
    customFields { selections lengthCm }
    invalidReason { code message }
    ${SET_LINE_FIELDS}
    productVariant {
      id name
      product { slug name featuredAsset { source } productDefinition }
    }
  }
`;

// Vendure ErrorCode → i18next key; islands translate via their client i18n.
const ERROR_KEYS: Record<string, string> = {
  EMAIL_ADDRESS_CONFLICT_ERROR: "errorCodes.EMAIL_ADDRESS_CONFLICT_ERROR",
};

const ERROR_FIELDS = `__typename ... on ErrorResult { errorCode message }`;
const INTERCEPTOR_FIELDS = `... on OrderInterceptorError { interceptorError }`;
const TRANSITION_FIELDS = `... on OrderStateTransitionError { transitionError }`;

function orderResult(extraErrorFields: string): string {
  return `... on Order { __typename ${ORDER_FIELDS} } ${ERROR_FIELDS} ${extraErrorFields}`;
}

const ErrorResultSchema = z.object({
  __typename: z.string(),
  message: z.string().optional(),
  errorCode: z.string().optional(),
  interceptorError: z.string().optional(),
  transitionError: z.string().optional(),
});

const OrderResultSchema = z.union([
  OrderSchema.extend({ __typename: z.literal("Order") }),
  ErrorResultSchema,
]);

const EnvelopeSchema = z.object({
  data: z.unknown().optional(),
  errors: z
    .array(
      z.object({
        message: z.string(),
        extensions: z.object({ code: z.string().optional() }).optional(),
      })
    )
    .optional(),
});

function asFailure(error: unknown): Failure {
  if (error instanceof Error) {
    return {
      reason: "errors.network",
      detail: `${error.name}: ${error.message}`,
      stack: error.stack,
    };
  }

  return { reason: "errors.network", detail: String(error) };
}

export function createBasketApi(deps: BasketApiDeps): BasketApi {
  function language(): string {
    return typeof deps.languageCode === "function" ? deps.languageCode() : deps.languageCode;
  }

  async function request<Schema extends z.ZodType>(
    query: string,
    variables: Record<string, unknown>,
    schema: Schema
  ): Promise<Result<z.output<Schema>>> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept-Language": language(),
    };
    const token = deps.tokens.get();

    if (token !== null) {
      headers.Authorization = `Bearer ${token}`;
    }

    let response: Response;

    try {
      response = await deps.fetch(
        `${deps.apiUrl}/shop-api?languageCode=${encodeURIComponent(language())}`,
        { method: "POST", headers, body: JSON.stringify({ query, variables }) }
      );
    } catch (error) {
      return { ok: false, failure: asFailure(error) };
    }

    const issued = response.headers.get("vendure-auth-token");

    if (issued !== null) {
      deps.tokens.set(issued);
    }

    const status = `HTTP ${response.status.toString()}`;
    let body: unknown;

    try {
      body = await response.json();
    } catch (error) {
      const failure = asFailure(error);

      return {
        ok: false,
        failure: { ...failure, reason: "errors.server", detail: `${status}: ${failure.detail}` },
      };
    }

    const envelope = EnvelopeSchema.safeParse(body);

    if (!envelope.success) {
      return {
        ok: false,
        failure: { reason: "errors.server", detail: `${status}: ${JSON.stringify(body)}` },
      };
    }

    if (envelope.data.errors !== undefined && envelope.data.errors.length > 0) {
      return {
        ok: false,
        failure: {
          reason: "errors.server",
          detail: `${status}: ${envelope.data.errors.map((e) => e.message).join("; ")}`,
          tokenRejected: isTokenRejection(
            response.status,
            envelope.data.errors.flatMap((e) => e.extensions?.code ?? [])
          ),
        },
      };
    }

    const data = schema.safeParse(envelope.data.data);

    if (!data.success) {
      return {
        ok: false,
        failure: { reason: "errors.server", detail: `${status}: ${data.error.message}` },
      };
    }

    return { ok: true, value: data.data };
  }

  async function orderMutation(
    field: string,
    signature: string,
    args: string,
    variables: Record<string, unknown>,
    extraErrorFields = ""
  ): Promise<Result<Order>> {
    const result = await request(
      `mutation M${signature} { ${field}${args} { ${orderResult(extraErrorFields)} } }`,
      variables,
      z.partialRecord(z.string(), OrderResultSchema)
    );

    if (!result.ok) {
      return result;
    }

    const payload = result.value[field];

    if (payload === undefined) {
      return { ok: false, failure: { reason: "errors.server", detail: `missing ${field}` } };
    }

    if ("id" in payload) {
      return { ok: true, value: payload };
    }

    const hungarian =
      "errorCode" in payload && typeof payload.errorCode === "string"
        ? ERROR_KEYS[payload.errorCode]
        : undefined;

    const message =
      hungarian ??
      ("interceptorError" in payload ? payload.interceptorError : undefined) ??
      ("transitionError" in payload ? payload.transitionError : undefined) ??
      ("message" in payload ? payload.message : undefined) ??
      payload.__typename;

    return { ok: false, failure: { reason: message, detail: `${payload.__typename}: ${message}` } };
  }

  return {
    async activeOrder() {
      const result = await request(
        `query ActiveOrder { activeOrder { ${ORDER_FIELDS} } }`,
        {},
        z.object({ activeOrder: OrderSchema.nullable() })
      );

      return result.ok ? { ok: true, value: result.value.activeOrder } : result;
    },
    addItem: (input) =>
      orderMutation(
        "addItemToOrder",
        "($id: ID!, $quantity: Int!, $customFields: OrderLineCustomFieldsInput)",
        "(productVariantId: $id, quantity: $quantity, customFields: $customFields)",
        { id: input.productVariantId, quantity: input.quantity, customFields: input.customFields },
        INTERCEPTOR_FIELDS
      ),
    adjustLine: (orderLineId, quantity) =>
      orderMutation(
        "adjustOrderLine",
        "($id: ID!, $quantity: Int!)",
        "(orderLineId: $id, quantity: $quantity)",
        { id: orderLineId, quantity },
        INTERCEPTOR_FIELDS
      ),
    removeLine: (orderLineId) =>
      orderMutation(
        "removeOrderLine",
        "($id: ID!)",
        "(orderLineId: $id)",
        { id: orderLineId },
        INTERCEPTOR_FIELDS
      ),
    async productVariantId(slug) {
      const result = await request(
        `query ProductVariant($slug: String!) { product(slug: $slug) { variants { id } } }`,
        { slug },
        ProductVariantIdsSchema
      );

      if (!result.ok) {
        return result;
      }

      return { ok: true, value: result.value.product?.variants.at(0)?.id };
    },
    async eligibleShippingMethods() {
      const result = await request(
        `query Eligible { eligibleShippingMethods { id name description priceWithTax customFields { requiresAddress } } }`,
        {},
        z.object({ eligibleShippingMethods: z.array(ShippingQuoteSchema) })
      );

      return result.ok ? { ok: true, value: result.value.eligibleShippingMethods } : result;
    },
    setCustomer: (input) =>
      orderMutation("setCustomerForOrder", "($input: CreateCustomerInput!)", "(input: $input)", {
        input,
      }),
    setShippingAddress: (input) =>
      orderMutation("setOrderShippingAddress", "($input: CreateAddressInput!)", "(input: $input)", {
        input,
      }),
    setBillingAddress: (input) =>
      orderMutation("setOrderBillingAddress", "($input: CreateAddressInput!)", "(input: $input)", {
        input,
      }),
    unsetBillingAddress: () => orderMutation("unsetOrderBillingAddress", "", "", {}),
    setShippingMethod: (shippingMethodId) =>
      orderMutation("setOrderShippingMethod", "($id: [ID!]!)", "(shippingMethodId: $id)", {
        id: [shippingMethodId],
      }),
    setOrderCustomFields: (customFields) =>
      orderMutation("setOrderCustomFields", "($input: UpdateOrderInput!)", "(input: $input)", {
        input: { customFields },
      }),
    transitionToArrangingPayment: () =>
      orderMutation(
        "transitionOrderToState",
        "($state: String!)",
        "(state: $state)",
        { state: "ArrangingPayment" },
        TRANSITION_FIELDS
      ),
  };
}
