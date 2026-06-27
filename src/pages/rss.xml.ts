import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

export const GET: APIRoute = async (context) => {
  const blog = await getCollection("blog");
  return rss({
    title: "Babasarok",
    description: "Egyedi, kézzel készített babatermékek.",
    site: context.site ?? new URL("https://babasarok.net"),
    items: blog.map((post) => ({
      title: post.data.title,
      link: `/blog/${post.id}/`,
    })),
    customData: `<language>hu</language>`,
  });
};
