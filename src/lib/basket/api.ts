import { z } from "zod";
import {
  OrderSchema,
  ShippingQuoteSchema,
  VariantOptionsSchema,
  type Order,
  type ShippingQuote,
} from "./schemas";

export interface TokenStore {
  get(): string | null;
  set(token: string): void;
}

export interface BasketApiDeps {
  fetch: typeof fetch;
  apiUrl: string;
  languageCode: string;
  tokens: TokenStore;
}

export interface Failure {
  reason: string;
  detail: string;
  stack?: string | undefined;
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
  message: string;
  termsAccepted: boolean;
  submissionTransactionId: string;
}

export interface VariantOptions {
  id: string;
  options: Array<{ group: string; code: string }>;
}

export interface BasketApi {
  activeOrder(): Promise<Result<Order | null>>;
  addItem(input: LineInput): Promise<Result<Order>>;
  adjustLine(orderLineId: string, quantity: number): Promise<Result<Order>>;
  removeLine(orderLineId: string): Promise<Result<Order>>;
  productVariants(slug: string): Promise<Result<VariantOptions[]>>;
  eligibleShippingMethods(): Promise<Result<ShippingQuote[]>>;
  setCustomer(input: CustomerInput): Promise<Result<Order>>;
  setShippingAddress(streetLine1: string, countryCode: string): Promise<Result<Order>>;
  setShippingMethod(shippingMethodId: string): Promise<Result<Order>>;
  setOrderCustomFields(input: OrderCustomFieldsInput): Promise<Result<Order>>;
  transitionToArrangingPayment(): Promise<Result<Order>>;
}

const ORDER_FIELDS = `
  id code state currencyCode totalQuantity subTotalWithTax shippingWithTax totalWithTax
  discounts { description amountWithTax }
  shippingLines { priceWithTax discountedPriceWithTax shippingMethod { id } }
  lines {
    id quantity unitPriceWithTax discountedLinePriceWithTax
    customFields { selections lengthCm }
    invalidReason { code message }
    productVariant {
      id name
      product { slug name featuredAsset { source } productDefinition }
    }
  }
`;

const ERROR_FIELDS = `
  __typename
  ... on ErrorResult { errorCode message }
  ... on OrderInterceptorError { interceptorError }
  ... on OrderStateTransitionError { transitionError }
`;

const ORDER_RESULT = `... on Order { __typename ${ORDER_FIELDS} } ${ERROR_FIELDS}`;

const ErrorResultSchema = z.object({
  __typename: z.string(),
  message: z.string().optional(),
  interceptorError: z.string().optional(),
  transitionError: z.string().optional(),
});

const OrderResultSchema = z.union([
  OrderSchema.extend({ __typename: z.literal("Order") }),
  ErrorResultSchema,
]);

const EnvelopeSchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

function asFailure(error: unknown): Failure {
  if (error instanceof Error) {
    return {
      reason: "hálózati hiba",
      detail: `${error.name}: ${error.message}`,
      stack: error.stack,
    };
  }

  return { reason: "hálózati hiba", detail: String(error) };
}

export function createBasketApi(deps: BasketApiDeps): BasketApi {
  async function request<Schema extends z.ZodType>(
    query: string,
    variables: Record<string, unknown>,
    schema: Schema
  ): Promise<Result<z.output<Schema>>> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = deps.tokens.get();

    if (token !== null) {
      headers.Authorization = `Bearer ${token}`;
    }

    let response: Response;

    try {
      response = await deps.fetch(
        `${deps.apiUrl}/shop-api?languageCode=${encodeURIComponent(deps.languageCode)}`,
        { method: "POST", headers, body: JSON.stringify({ query, variables }) }
      );
    } catch (error) {
      return { ok: false, failure: asFailure(error) };
    }

    const issued = response.headers.get("vendure-auth-token");

    if (issued !== null) {
      deps.tokens.set(issued);
    }

    const status = `szerverhiba ${response.status.toString()}`;
    let body: unknown;

    try {
      body = await response.json();
    } catch (error) {
      return { ok: false, failure: { ...asFailure(error), reason: status } };
    }

    const envelope = EnvelopeSchema.safeParse(body);

    if (!envelope.success) {
      return { ok: false, failure: { reason: status, detail: JSON.stringify(body) } };
    }

    if (envelope.data.errors !== undefined && envelope.data.errors.length > 0) {
      return {
        ok: false,
        failure: { reason: status, detail: envelope.data.errors.map((e) => e.message).join("; ") },
      };
    }

    const data = schema.safeParse(envelope.data.data);

    if (!data.success) {
      return { ok: false, failure: { reason: status, detail: data.error.message } };
    }

    return { ok: true, value: data.data };
  }

  async function orderMutation(
    field: string,
    signature: string,
    args: string,
    variables: Record<string, unknown>
  ): Promise<Result<Order>> {
    const result = await request(
      `mutation M${signature} { ${field}${args} { ${ORDER_RESULT} } }`,
      variables,
      z.partialRecord(z.string(), OrderResultSchema)
    );

    if (!result.ok) {
      return result;
    }

    const payload = result.value[field];

    if (payload === undefined) {
      return { ok: false, failure: { reason: "szerverhiba", detail: `missing ${field}` } };
    }

    if ("id" in payload) {
      return { ok: true, value: payload };
    }

    const message =
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
        { id: input.productVariantId, quantity: input.quantity, customFields: input.customFields }
      ),
    adjustLine: (orderLineId, quantity) =>
      orderMutation(
        "adjustOrderLine",
        "($id: ID!, $quantity: Int!)",
        "(orderLineId: $id, quantity: $quantity)",
        { id: orderLineId, quantity }
      ),
    removeLine: (orderLineId) =>
      orderMutation("removeOrderLine", "($id: ID!)", "(orderLineId: $id)", { id: orderLineId }),
    async productVariants(slug) {
      const result = await request(
        `query Variants($slug: String!) { product(slug: $slug) { variants { id options { code group { code } } } } }`,
        { slug },
        z.object({ product: z.object({ variants: z.array(VariantOptionsSchema) }).nullable() })
      );

      if (!result.ok) {
        return result;
      }

      return {
        ok: true,
        value: (result.value.product?.variants ?? []).map((variant) => ({
          id: variant.id,
          options: variant.options.map((option) => ({
            group: option.group.code,
            code: option.code,
          })),
        })),
      };
    },
    async eligibleShippingMethods() {
      const result = await request(
        `query Eligible { eligibleShippingMethods { id name description priceWithTax customFields } }`,
        {},
        z.object({ eligibleShippingMethods: z.array(ShippingQuoteSchema) })
      );

      return result.ok ? { ok: true, value: result.value.eligibleShippingMethods } : result;
    },
    setCustomer: (input) =>
      orderMutation("setCustomerForOrder", "($input: CreateCustomerInput!)", "(input: $input)", {
        input,
      }),
    setShippingAddress: (streetLine1, countryCode) =>
      orderMutation("setOrderShippingAddress", "($input: CreateAddressInput!)", "(input: $input)", {
        input: { streetLine1, countryCode },
      }),
    setShippingMethod: (shippingMethodId) =>
      orderMutation("setOrderShippingMethod", "($id: [ID!]!)", "(shippingMethodId: $id)", {
        id: [shippingMethodId],
      }),
    setOrderCustomFields: (customFields) =>
      orderMutation("setOrderCustomFields", "($input: UpdateOrderInput!)", "(input: $input)", {
        input: { customFields },
      }),
    transitionToArrangingPayment: () =>
      orderMutation("transitionOrderToState", "($state: String!)", "(state: $state)", {
        state: "ArrangingPayment",
      }),
  };
}
