import type { APIRoute } from "astro";
import { getDeliveryMethods, getMaterials } from "../../lib/data";

export const GET: APIRoute = async (context) => {
  try {
    const result = await getDeliveryMethods();
    return new Response(JSON.stringify(result), { status: 200 });
  } catch (error) {
    console.error("Error fetching delivery methods:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch delivery methods" }),
      {
        status: 500,
      },
    );
  }
};
