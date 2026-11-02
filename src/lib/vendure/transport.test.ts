import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createShopQuery, ShopApiError } from "./transport";

function transportReturning(
  body: unknown,
  status = 200
): Parameters<typeof createShopQuery>[0] & {
  calls: Array<{ url: string; body: unknown }>;
} {
  const calls: Array<{ url: string; body: unknown }> = [];

  return {
    calls,
    apiUrl: "http://api.test",
    languageCode: "hu",
    fetch: (input, init) => {
      if (typeof input !== "string" || typeof init?.body !== "string") {
        throw new TypeError("transport must send a string url and body");
      }

      calls.push({ url: input, body: JSON.parse(init.body) });

      return Promise.resolve(Response.json(body, { status }));
    },
  };
}

const request = {
  query: "{ n }",
  variables: { a: 1 },
  schema: z.object({ n: z.number() }),
};

describe("createShopQuery", () => {
  it("posts the query to the shop API in the configured language and parses data", async () => {
    const transport = transportReturning({ data: { n: 3 } });

    await expect(createShopQuery(transport)(request)).resolves.toEqual({ n: 3 });
    expect(transport.calls).toEqual([
      {
        url: "http://api.test/shop-api?languageCode=hu",
        body: { query: "{ n }", variables: { a: 1 } },
      },
    ]);
  });

  it("throws the GraphQL error messages", async () => {
    const transport = transportReturning({ errors: [{ message: "a" }, { message: "b" }] });

    await expect(createShopQuery(transport)(request)).rejects.toThrow("a; b");
  });

  it("throws on an HTTP error status", async () => {
    await expect(createShopQuery(transportReturning({}, 502))(request)).rejects.toBeInstanceOf(
      ShopApiError
    );
  });

  it("rejects data that does not match the schema", async () => {
    const transport = transportReturning({ data: { n: "x" } });

    await expect(createShopQuery(transport)(request)).rejects.toThrow();
  });
});
