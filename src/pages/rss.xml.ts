import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { defaultLocale, entrySlugFromId, localeFromEntryId } from "@/lib/i18n";

export const GET: APIRoute = async (context) => {
  const blog = (await getCollection("blog")).filter(
    (post) => localeFromEntryId(post.id) === defaultLocale
  );
  return rss({
    title: "Babasarok",
    description: "Egyedi, kézzel készített babatermékek.",
    site: context.site ?? new URL("https://babasarok.net"),
    items: blog.map((post) => ({
      title: post.data.title,
      link: `/blog/${entrySlugFromId(post.id)}/`,
    })),
    customData: `<language>hu</language>`,
  });
};
