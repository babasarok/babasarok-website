import { z } from "zod";

export interface ShopTransport {
  fetch: typeof fetch;
  apiUrl: string;
  /** The default request language; each request may override it. */
  languageCode: string;
}

export interface ShopRequest<Schema extends z.ZodType> {
  query: string;
  variables?: Record<string, unknown>;
  schema: Schema;
  languageCode?: string;
}

export type ShopQuery = <Schema extends z.ZodType>(
  request: ShopRequest<Schema>
) => Promise<z.output<Schema>>;

export class ShopApiError extends Error {}

const EnvelopeSchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

export function createShopQuery(transport: ShopTransport): ShopQuery {
  return async ({ query, variables, schema, languageCode: requestLanguage }) => {
    const languageCode = requestLanguage ?? transport.languageCode;
    const url = `${transport.apiUrl}/shop-api?languageCode=${encodeURIComponent(languageCode)}`;
    const response = await transport.fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept-Language": languageCode },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new ShopApiError(`Shop API HTTP ${response.status}`);
    }

    const envelope = EnvelopeSchema.parse(await response.json());

    if (envelope.errors !== undefined && envelope.errors.length > 0) {
      throw new ShopApiError(envelope.errors.map((error) => error.message).join("; "));
    }

    return schema.parse(envelope.data);
  };
}
