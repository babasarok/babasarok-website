import type { APIRoute } from "astro";
import { getProducts } from "../../lib/data";

export const GET: APIRoute = async (context) => {
  try {
    const result = await getProducts();
    return new Response(JSON.stringify(result), { status: 200 });
  } catch (error) {
    console.error("Error fetching products:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch products" }), {
      status: 500,
    });
  }
};
