import type { MetadataRoute } from "next";
import { getStock } from "@/lib/stock";
import { posts } from "@/data/posts";
import { hasJournal } from "@/data/launch";
import { site } from "@/data/site";

/**
 * Every page a crawler should know about.
 *
 * Static routes first, then one entry per published item. Tolerant of an
 * empty catalogue by construction — on launch day the stock list is `[]` and
 * the sitemap is just the static pages, which is correct. The Journal only
 * appears once a post is verified, matching the navigation.
 *
 * Absolute URLs are built from the launch domain rather than metadataBase so
 * this file needs no request context and works at build time.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = `https://${site.domain}`;
  const url = (path: string) => `${origin}${path}`;

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: url("/"), changeFrequency: "daily", priority: 1 },
    { url: url("/wanted"), changeFrequency: "monthly", priority: 0.8 },
    { url: url("/about"), changeFrequency: "monthly", priority: 0.6 },
    { url: url("/conditions"), changeFrequency: "monthly", priority: 0.6 },
    { url: url("/payment-options"), changeFrequency: "monthly", priority: 0.6 },
    { url: url("/delivery"), changeFrequency: "monthly", priority: 0.6 },
    { url: url("/before-you-buy"), changeFrequency: "monthly", priority: 0.5 },
    { url: url("/privacy"), changeFrequency: "yearly", priority: 0.2 },
    ...(hasJournal
      ? [{ url: url("/blog"), changeFrequency: "weekly" as const, priority: 0.5 }]
      : []),
  ];

  const stock = await getStock();
  const items: MetadataRoute.Sitemap = stock.map((item) => ({
    url: url(`/stock/${item.slug}`),
    lastModified: item.publishedAt ? new Date(item.publishedAt) : undefined,
    changeFrequency: "weekly",
    // A sold unit stays listed, but it is no longer the page we want found first.
    priority: item.sold ? 0.4 : 0.9,
  }));

  const journal: MetadataRoute.Sitemap = posts.map((post) => ({
    url: url(`/blog/${post.slug}`),
    lastModified: new Date(post.date),
    changeFrequency: "yearly",
    priority: 0.5,
  }));

  return [...staticRoutes, ...items, ...journal];
}
