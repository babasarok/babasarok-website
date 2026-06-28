import type { APIRoute } from "astro";
import { getMaterials } from "../../lib/data";

export const GET: APIRoute = async (context) => {
  try {
    const result = await getMaterials();
    return new Response(JSON.stringify(result), { status: 200 });
  } catch (error) {
    console.error("Error fetching materials:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch materials" }),
      {
        status: 500,
      },
    );
  }
};
