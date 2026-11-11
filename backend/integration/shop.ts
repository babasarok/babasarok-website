/**
 * Shop-API operations the suites share (one typed place for the documents and
 * the response schemas), plus the admin lookups that turn a configured
 * selection into the variant sku the shop API orders by.
 */
import type { SimpleGraphQLClient } from "@vendure/testing";
import { z } from "zod";
import { run, type IntegrationServer } from "./harness";
import type { MaterialSlug, ProductId } from "./fixtures";

const ORDER_FIELDS = `
  code state totalQuantity subTotalWithTax shippingWithTax totalWithTax
  discounts { description amountWithTax }
  customer { emailAddress firstName lastName phoneNumber }
  shippingAddress { streetLine1 streetLine2 postalCode city countryCode }
  billingAddress { company streetLine1 streetLine2 postalCode city countryCode }
  shippingLines { priceWithTax shippingMethod { code } }
  customFields { message termsAccepted taxNumber submissionTransactionId }
  setDiscounts { groupId title amount lines { orderLineId units } }
  lines {
    id quantity unitPriceWithTax linePriceWithTax
    discounts { amountWithTax }
    productVariant { sku }
    customFields { selections lengthCm configText }
    invalidReason { code message }
    setState { kind groupId title coveredUnits materialSyncFromLineId }
  }
`;

const LineSchema = z.object({
  id: z.string(),
  quantity: z.number(),
  unitPriceWithTax: z.number(),
  linePriceWithTax: z.number(),
  discounts: z.array(z.object({ amountWithTax: z.number() })),
  productVariant: z.object({ sku: z.string() }),
  customFields: z.object({
    selections: z.string().nullable(),
    lengthCm: z.number().nullable(),
    configText: z.string().nullable(),
  }),
  invalidReason: z.object({ code: z.string(), message: z.string() }).nullable(),
  setState: z
    .object({
      kind: z.enum(["ACTIVE", "PENDING_PARTNER", "PENDING_MATERIAL"]),
      groupId: z.string(),
      title: z.string(),
      coveredUnits: z.number(),
      materialSyncFromLineId: z.string().nullable(),
    })
    .nullable(),
});

const AddressSchema = z.object({
  company: z.string().nullable(),
  streetLine1: z.string().nullable(),
  streetLine2: z.string().nullable(),
  postalCode: z.string().nullable(),
  city: z.string().nullable(),
  countryCode: z.string().nullable(),
});

export const OrderSchema = z.object({
  code: z.string(),
  state: z.string(),
  totalQuantity: z.number(),
  subTotalWithTax: z.number(),
  shippingWithTax: z.number(),
  totalWithTax: z.number(),
  discounts: z.array(z.object({ description: z.string(), amountWithTax: z.number() })),
  customer: z
    .object({
      emailAddress: z.string(),
      firstName: z.string(),
      lastName: z.string(),
      phoneNumber: z.string().nullable(),
    })
    .nullable(),
  shippingAddress: AddressSchema,
  billingAddress: AddressSchema.nullable(),
  shippingLines: z.array(
    z.object({ priceWithTax: z.number(), shippingMethod: z.object({ code: z.string() }) })
  ),
  customFields: z.object({
    message: z.string().nullable(),
    termsAccepted: z.boolean().nullable(),
    taxNumber: z.string().nullable(),
    submissionTransactionId: z.string().nullable(),
  }),
  setDiscounts: z.array(
    z.object({
      groupId: z.string(),
      title: z.string(),
      amount: z.number(),
      lines: z.array(z.object({ orderLineId: z.string(), units: z.number() })),
    })
  ),
  lines: z.array(LineSchema),
});

export type Order = z.output<typeof OrderSchema>;

const ErrorResultSchema = z.object({ errorCode: z.string(), message: z.string() });

const OrderResultSchema = z.union([
  OrderSchema.extend({ __typename: z.literal("Order") }),
  ErrorResultSchema.extend({ __typename: z.string() }),
]);

export class RefusedError extends Error {
  constructor(
    readonly errorCode: string,
    message: string
  ) {
    super(message);
  }
}

async function orderMutation(
  client: SimpleGraphQLClient,
  field: string,
  document: string,
  variables: Record<string, unknown>
): Promise<Order> {
  const data = await run(client, document, variables, z.record(z.string(), OrderResultSchema));
  const result = data[field];

  if (result === undefined || "errorCode" in result) {
    throw new RefusedError(result?.errorCode ?? "NO_RESULT", result?.message ?? "");
  }

  return result;
}

export interface LineSpec {
  sku: string;
  quantity?: number;
  selections?: Record<string, unknown>;
  lengthCm?: number;
}

export function materialSelection(
  materialId: MaterialSlug,
  color: string
): { kind: "material"; materialId: string; colors: string[] } {
  return { kind: "material", materialId, colors: [color] };
}

/** A buyer's shop session (its own bearer token, so its own active order). */
export interface Shopper {
  client: SimpleGraphQLClient;
  server: IntegrationServer;
}

export function newShopper(server: IntegrationServer): Shopper {
  return { client: server.newShopSession(), server };
}

export async function addLine(shopper: Shopper, spec: LineSpec): Promise<Order> {
  const variantId = (await adminVariant(shopper.server, spec.sku)).id;

  return orderMutation(
    shopper.client,
    "addItemToOrder",
    `mutation($variantId: ID!, $quantity: Int!, $customFields: OrderLineCustomFieldsInput) {
      addItemToOrder(productVariantId: $variantId, quantity: $quantity, customFields: $customFields) {
        __typename ... on Order { ${ORDER_FIELDS} } ... on ErrorResult { errorCode message }
      }
    }`,
    {
      variantId,
      quantity: spec.quantity ?? 1,
      customFields: {
        selections: JSON.stringify(spec.selections ?? {}),
        ...(spec.lengthCm === undefined ? {} : { lengthCm: spec.lengthCm }),
      },
    }
  );
}

export async function adjustLine(
  shopper: Shopper,
  orderLineId: string,
  quantity: number
): Promise<Order> {
  return orderMutation(
    shopper.client,
    "adjustOrderLine",
    `mutation($orderLineId: ID!, $quantity: Int!) {
      adjustOrderLine(orderLineId: $orderLineId, quantity: $quantity) {
        __typename ... on Order { ${ORDER_FIELDS} } ... on ErrorResult { errorCode message }
      }
    }`,
    { orderLineId, quantity }
  );
}

export async function removeLine(shopper: Shopper, orderLineId: string): Promise<Order> {
  return orderMutation(
    shopper.client,
    "removeOrderLine",
    `mutation($orderLineId: ID!) {
      removeOrderLine(orderLineId: $orderLineId) {
        __typename ... on Order { ${ORDER_FIELDS} } ... on ErrorResult { errorCode message }
      }
    }`,
    { orderLineId }
  );
}

export async function activeOrder(shopper: Shopper): Promise<Order> {
  const data = await run(
    shopper.client,
    `query { activeOrder { ${ORDER_FIELDS} } }`,
    {},
    z.object({ activeOrder: OrderSchema.nullable() })
  );

  if (data.activeOrder === null) {
    throw new Error("There is no active order.");
  }

  return data.activeOrder;
}

/** The Hungarian refusal of the transition (`transitionError`), or the order when it went through. */
export async function transitionTo(
  shopper: Shopper,
  state: string
): Promise<{ order: Order } | { refusal: string }> {
  const data = await run(
    shopper.client,
    `mutation($state: String!) {
      transitionOrderToState(state: $state) {
        __typename
        ... on Order { ${ORDER_FIELDS} }
        ... on OrderStateTransitionError { transitionError }
      }
    }`,
    { state },
    z.object({
      transitionOrderToState: z.union([
        OrderSchema.extend({ __typename: z.literal("Order") }),
        z.object({ __typename: z.string(), transitionError: z.string() }),
      ]),
    })
  );
  const result = data.transitionOrderToState;

  if ("transitionError" in result) {
    return { refusal: result.transitionError };
  }

  return { order: result };
}

const CATALOG_VARIANTS = `query($sku: String!) {
  productVariants(options: { filter: { sku: { eq: $sku } } }) { items { id enabled price } }
}`;

const VariantsSchema = z.object({
  productVariants: z.object({
    items: z.array(z.object({ id: z.string(), enabled: z.boolean(), price: z.number() })),
  }),
});

export async function adminVariant(
  server: IntegrationServer,
  sku: string
): Promise<{ id: string; enabled: boolean; price: number }> {
  const { productVariants } = await run(server.admin, CATALOG_VARIANTS, { sku }, VariantsSchema);
  const variant = productVariants.items.at(0);

  if (variant === undefined) {
    throw new Error(`No variant with sku ${sku}.`);
  }

  return variant;
}

export async function chooseShipping(shopper: Shopper, code: string): Promise<Order> {
  const { eligibleShippingMethods } = await run(
    shopper.client,
    `query { eligibleShippingMethods { id code } }`,
    {},
    z.object({ eligibleShippingMethods: z.array(z.object({ id: z.string(), code: z.string() })) })
  );
  const method = eligibleShippingMethods.find((candidate) => candidate.code === code);

  if (method === undefined) {
    throw new Error(`Shipping method ${code} is not eligible.`);
  }

  return orderMutation(
    shopper.client,
    "setOrderShippingMethod",
    `mutation($id: [ID!]!) {
      setOrderShippingMethod(shippingMethodId: $id) {
        __typename ... on Order { ${ORDER_FIELDS} } ... on ErrorResult { errorCode message }
      }
    }`,
    { id: [method.id] }
  );
}

export const BUYER = {
  emailAddress: "vevo@example.com",
  firstName: "Béla",
  lastName: "Kovács",
  phoneNumber: "+36301234567",
};

export const BUYER_ADDRESS = {
  street: "Fő u.",
  houseNumber: "1.",
  postalCode: "3894",
  city: "Telkibánya",
};

export async function setCustomer(
  shopper: Shopper,
  emailAddress = BUYER.emailAddress
): Promise<Order> {
  return orderMutation(
    shopper.client,
    "setCustomerForOrder",
    `mutation($input: CreateCustomerInput!) {
      setCustomerForOrder(input: $input) {
        __typename ... on Order { ${ORDER_FIELDS} } ... on ErrorResult { errorCode message }
      }
    }`,
    { input: { ...BUYER, emailAddress } }
  );
}

export async function setAddress(shopper: Shopper): Promise<void> {
  await run(
    shopper.client,
    `mutation($input: CreateAddressInput!) { setOrderShippingAddress(input: $input) { ... on Order { code } } }`,
    {
      input: {
        streetLine1: BUYER_ADDRESS.street,
        streetLine2: BUYER_ADDRESS.houseNumber,
        postalCode: BUYER_ADDRESS.postalCode,
        city: BUYER_ADDRESS.city,
        countryCode: "HU",
      },
    },
    z.unknown()
  );
}

export async function setBillingAddress(shopper: Shopper, company = ""): Promise<void> {
  await run(
    shopper.client,
    `mutation($input: CreateAddressInput!) { setOrderBillingAddress(input: $input) { ... on Order { code } } }`,
    {
      input: {
        company,
        streetLine1: BUYER_ADDRESS.street,
        streetLine2: BUYER_ADDRESS.houseNumber,
        postalCode: BUYER_ADDRESS.postalCode,
        city: BUYER_ADDRESS.city,
        countryCode: "HU",
      },
    },
    z.unknown()
  );
}

export async function setOrderNotes(
  shopper: Shopper,
  fields: { message: string; termsAccepted: boolean; submissionTransactionId: string; taxNumber?: string }
): Promise<void> {
  await run(
    shopper.client,
    `mutation($input: UpdateOrderInput!) { setOrderCustomFields(input: $input) { ... on Order { code } } }`,
    { input: { customFields: fields } },
    z.unknown()
  );
}

/** Everything the checkout needs besides the lines, so a transition can only be refused for them. */
export async function completeCheckout(
  shopper: Shopper,
  shippingCode = "szemelyes"
): Promise<void> {
  await setCustomer(shopper);
  await chooseShipping(shopper, shippingCode);
  await setOrderNotes(shopper, {
    message: "",
    termsAccepted: true,
    submissionTransactionId: `int-${Date.now()}`,
  });
}

/** Admin edits the owner makes after buyers have lines in their baskets. */
export async function setVariantEnabled(
  server: IntegrationServer,
  variantSku: string,
  enabled: boolean
): Promise<void> {
  const variant = await adminVariant(server, variantSku);

  await run(
    server.admin,
    `mutation($input: [UpdateProductVariantInput!]!) { updateProductVariants(input: $input) { id } }`,
    { input: [{ id: variant.id, enabled }] },
    z.unknown()
  );
}

export async function setVariantPrice(
  server: IntegrationServer,
  variantSku: string,
  price: number
): Promise<void> {
  const variant = await adminVariant(server, variantSku);

  await run(
    server.admin,
    `mutation($input: [UpdateProductVariantInput!]!) { updateProductVariants(input: $input) { id } }`,
    { input: [{ id: variant.id, price }] },
    z.unknown()
  );
}

/** Removes one color from a material, the way the owner does in the dashboard. */
export async function removeMaterialColor(
  server: IntegrationServer,
  materialSlug: string,
  colorId: string
): Promise<void> {
  const { materials } = await run(
    server.admin,
    `query { materials { id slug translations { languageCode label } colors { id hex translations { languageCode label } } } }`,
    {},
    z.object({
      materials: z.array(
        z.object({
          id: z.string(),
          slug: z.string(),
          translations: z.array(z.object({ languageCode: z.string(), label: z.string() })),
          colors: z.array(
            z.object({
              id: z.string(),
              hex: z.string().nullable(),
              translations: z.array(z.object({ languageCode: z.string(), label: z.string() })),
            })
          ),
        })
      ),
    })
  );
  const material = materials.find((candidate) => candidate.slug === materialSlug);

  if (material === undefined) {
    throw new Error(`No material ${materialSlug}.`);
  }

  await run(
    server.admin,
    `mutation($id: ID!, $input: MaterialInput!) { updateMaterial(id: $id, input: $input) { id } }`,
    {
      id: material.id,
      input: {
        slug: material.slug,
        translations: material.translations,
        colors: material.colors
          .filter((color) => color.id !== colorId)
          .map((color) => ({ id: color.id, hex: color.hex, translations: color.translations })),
      },
    },
    z.unknown()
  );
}

/** A registered customer (with a password), as created in the dashboard. */
export async function createRegisteredCustomer(
  server: IntegrationServer,
  emailAddress: string
): Promise<void> {
  const { createCustomer } = await run(
    server.admin,
    `mutation($input: CreateCustomerInput!, $password: String) {
      createCustomer(input: $input, password: $password) { __typename }
    }`,
    {
      input: { emailAddress, firstName: "Regisztrált", lastName: "Vevő" },
      password: "titok-123456",
    },
    z.object({ createCustomer: z.object({ __typename: z.string() }) })
  );

  if (createCustomer.__typename !== "Customer") {
    throw new Error(`The customer ${emailAddress} was not created.`);
  }
}

/** Drops one option of a choice field from the stored definition, the way the owner edits it. */
type StoredDefinition = z.output<typeof DefinitionSchema>;

async function settledSync(
  server: IntegrationServer,
  productId: ProductId
): Promise<{ syncState: string; syncError: string | null }> {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    const { productDefinition: current, jobs } = await run(
      server.admin,
      `query($productId: String!) {
        productDefinition(productId: $productId) { syncState syncError }
        jobs(options: { filter: { queueName: { eq: "product-definition-sync" }, isSettled: { eq: false } } }) {
          totalItems
        }
      }`,
      { productId },
      z.object({
        productDefinition: z.object({ syncState: z.string(), syncError: z.string().nullable() }),
        jobs: z.object({ totalItems: z.number() }),
      })
    );

    if (current.syncState !== "pending" && jobs.totalItems === 0) {
      return current;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`${productId} did not sync in time.`);
}

/** Saves an edited definition once queued syncs settled, and waits for its own sync. */
async function updateDefinition(
  server: IntegrationServer,
  productId: ProductId,
  edit: (definition: StoredDefinition) => StoredDefinition
): Promise<void> {
  await settledSync(server, productId);

  const { productDefinition } = await run(
    server.admin,
    `query($productId: String!) { productDefinition(productId: $productId) { definition } }`,
    { productId },
    z.object({ productDefinition: z.object({ definition: DefinitionSchema }) })
  );

  await run(
    server.admin,
    `mutation($productId: String!, $definition: JSON!) {
      updateProductDefinition(productId: $productId, definition: $definition) { productId }
    }`,
    { productId, definition: edit(productDefinition.definition) },
    z.unknown()
  );

  const settled = await settledSync(server, productId);

  if (settled.syncState === "failed") {
    throw new Error(`${productId} sync failed: ${settled.syncError}`);
  }
}

export async function removeChoiceOption(
  server: IntegrationServer,
  productId: ProductId,
  fieldId: string,
  optionId: string
): Promise<void> {
  await updateDefinition(server, productId, (definition) => ({
    ...definition,
    fields: definition.fields.map((field) =>
      field.id === fieldId && field.options !== undefined
        ? { ...field, options: field.options.filter((option) => option.id !== optionId) }
        : field
    ),
  }));
}

export async function setBasePrice(
  server: IntegrationServer,
  productId: ProductId,
  basePrice: number
): Promise<void> {
  await updateDefinition(server, productId, (definition) => ({ ...definition, basePrice }));
}

const DefinitionSchema = z
  .object({
    fields: z.array(
      z
        .object({
          id: z.string(),
          options: z.array(z.object({ id: z.string().optional() }).loose()).optional(),
        })
        .loose()
    ),
  })
  .loose();
