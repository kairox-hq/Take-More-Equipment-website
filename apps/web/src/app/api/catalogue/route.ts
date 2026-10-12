import { NextResponse } from "next/server";
import { getStock, getVocabulary } from "@/lib/stock";

/**
 * The index behind the search and menu overlays.
 *
 * Both live inside the navbar, which is on every page including the blog and
 * the policy pages — so threading the full catalogue into them as props would
 * mean every page paying for data most visitors never open. Fetching on first
 * open instead costs one request, only from people who actually search.
 *
 * Lean on purpose: the six fields a result row renders, nothing else.
 */
export async function GET() {
  const stock = await getStock();
  const vocabulary = await getVocabulary(stock);

  return NextResponse.json(
    {
      divisions: vocabulary.divisions,
      categories: vocabulary.categories,
      items: stock.map((item) => ({
        slug: item.slug,
        segments: item.segments,
        title: item.title,
        brand: item.brand,
        category: item.category,
        grade: item.grade,
        price: item.price,
        image: item.images[0] ?? null,
        sold: !!item.sold,
        availability: item.availability ?? "available",
        tags: item.tags,
      })),
    },
    {
      // NOT CDN-cached, deliberately — `private`, never `s-maxage`.
      //
      // An `s-maxage` here looks like a free win and is actually a bug: the
      // edge would keep serving the old body for the full window even after
      // revalidateTag() has dropped the underlying data, so a freshly
      // published item shows on its own detail page while staying invisible in
      // search and the menu. Caching belongs one layer down, on getStock(),
      // where the publish loop can actually reach it.
      //
      // A short browser-private TTL is a different thing: it stops one visitor
      // re-downloading the same index every time they open the search or the
      // menu on the next page, and it cannot block revalidateTag() because no
      // shared cache ever holds it.
      headers: { "cache-control": "private, max-age=60" },
    }
  );
}
