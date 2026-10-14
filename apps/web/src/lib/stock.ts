import "server-only";
import { itemSegments, type PublicAvailability } from "@takemore/core";

import { unstable_cache } from "next/cache";
import { createPublicClient } from "@takemore/db";
import { reportError } from "@takemore/observability";
import type {
  CategoryChoice,
  Equipment,
  GalleryMedia,
  Grade,
  Vocabulary,
} from "@/data/equipment";

/**
 * The storefront's data source.
 *
 * Reads `public_items`, which is filtered to published, undeleted stock and
 * carries no cost columns — the anonymous key cannot reach cost data at all, by
 * construction rather than by this file remembering not to select it.
 *
 * Results are cached and tagged, not re-fetched per request. The ops app pings
 * /api/revalidate when stock changes, which drops these tags; the time-based
 * expiry underneath is the safety net for a webhook that never arrives.
 */

export const STOCK_TAG = "stock";
const REVALIDATE_SECONDS = 300;

const SUPABASE_PUBLIC_PREFIX = "/storage/v1/object/public/item-media/";
const SUPABASE_RENDER_PREFIX = "/storage/v1/render/image/public/item-media/";

/**
 * One original per photo, three sizes on the way out. `card` is what the grid
 * and the search overlay use; the detail gallery asks for `full`.
 */
function imageUrl(
  media: { storage_path: string | null; external_url: string | null },
  width = 1200
): string | null {
  if (media.external_url) return media.external_url;
  if (!media.storage_path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}${SUPABASE_RENDER_PREFIX}${media.storage_path}?width=${width}&quality=78&resize=cover`;
}

/**
 * Video goes to the plain object endpoint, never the render one.
 *
 * The prefix imageUrl() uses is Supabase's IMAGE transformer: hand it an mp4 and
 * it answers with an error, not a movie. It would be the wrong endpoint even if
 * it did transcode, because `<video>` seeking needs the byte-range support that
 * only the object endpoint offers.
 */
function videoUrl(media: {
  storage_path: string | null;
  external_url: string | null;
}): string | null {
  if (media.external_url) return media.external_url;
  if (!media.storage_path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}${SUPABASE_PUBLIC_PREFIX}${media.storage_path}`;
}

type PublicItemRow = {
  id: string;
  slug: string;
  sku: string | null;
  title: string;
  brand: string | null;
  specs: unknown;
  division_slug: string | null;
  division_name: string | null;
  category_name: string | null;
  subcategory_name: string | null;
  condition_grade: Grade | null;
  description: string | null;
  workshop_notes: string[] | null;
  capacity: string | null;
  power: string | null;
  width_mm: number | null;
  depth_mm: number | null;
  height_mm: number | null;
  weight_kg: number | null;
  list_price_cents: number | null;
  retail_price_cents: number | null;
  sale_price_cents: number | null;
  sold: boolean | null;
  availability?: PublicAvailability;
  available_quantity?: number;
  featured: boolean | null;
  tag_slugs: string[] | null;
  published_at?: string | null;
};

/**
 * The generator types every view column as nullable, because a view's
 * nullability is genuinely unknowable to it. Narrowing happens here, once,
 * rather than with a `!` at every call site — and the defaults are chosen so a
 * half-filled row degrades into a dull card rather than a crash.
 */
function toEquipment(row: PublicItemRow, images: string[]): Equipment {
  const sold = row.sold ?? false;
  return {
    slug: row.slug,
    sku: row.sku ?? undefined,
    title: row.title,
    brand: row.brand ?? "",
    // The view inner-joins both, so in practice neither is ever null. The
    // fallbacks exist because a view column is typed nullable no matter what,
    // and a card that says "Uncategorised" beats one that says "undefined".
    division: row.division_name ?? "Uncategorised",
    divisionSlug: row.division_slug ?? "uncategorised",
    segments: itemSegments(row.specs, row.division_slug),
    category: row.category_name ?? "Uncategorised",
    // Left undefined rather than defaulted: the detail page skips the row
    // entirely when there is no subcategory, and "—" would be noise.
    subcategory: row.subcategory_name ?? undefined,
    // A sold unit shows what it actually went for; everything else shows the ask.
    price: Math.round(((sold ? row.sale_price_cents : null) ?? row.list_price_cents ?? 0) / 100),
    retailPrice: row.retail_price_cents ? Math.round(row.retail_price_cents / 100) : undefined,
    grade: row.condition_grade ?? "B",
    capacity: row.capacity ?? "—",
    power: row.power ?? "—",
    tags: row.tag_slugs ?? [],
    images,
    description: row.description ?? "",
    dimensionsMm: [row.width_mm ?? 0, row.depth_mm ?? 0, row.height_mm ?? 0],
    weightKg: Number(row.weight_kg ?? 0),
    sold,
    availability: row.availability ?? "available",
    availableQuantity: row.available_quantity,
    featured: row.featured ?? false,
    publishedAt: row.published_at ?? undefined,
  };
}

async function fetchStock(): Promise<Equipment[]> {
  const client = createPublicClient();

  const { data: items, error } = await client
    .from("public_items")
    .select("*")
    .order("featured", { ascending: false })
    .order("published_at", { ascending: false });

  // THROWS on failure, deliberately — see `tolerant()` below for why the
  // catch lives outside the cache rather than here.
  if (error) throw error;

  const rows = (items ?? []) as unknown as PublicItemRow[];
  if (rows.length === 0) return [];

  const { data: media, error: mediaError } = await client
    .from("public_item_media")
    .select("item_id, kind, storage_path, external_url, position")
    .in(
      "item_id",
      rows.map((r) => r.id)
    )
    .order("position");

  // A media failure used to be ignored, which cached a whole catalogue of
  // photo-less cards for five minutes. It is a failure like any other.
  if (mediaError) throw mediaError;

  const byItem = new Map<string, string[]>();
  for (const m of media ?? []) {
    // Photos only, and only here: `images` feeds cards, the search overlay and
    // the OG tag, and every one of those renders an <img>. Video reaches the
    // visitor through getGallery() below instead.
    if ((m as any).kind !== "photo") continue;
    const url = imageUrl(m as any);
    if (!url) continue;
    const list = byItem.get((m as any).item_id) ?? [];
    list.push(url);
    byItem.set((m as any).item_id, list);
  }

  return rows.map((row) => toEquipment(row, byItem.get(row.id) ?? []));
}

/**
 * Tolerate a failed read OUTSIDE the cache, never inside it.
 *
 * A storefront that 500s because the database hiccuped is worse than one that
 * shows an empty catalogue for a moment — so callers get `fallback`, not an
 * exception. This tolerance is also what lets CI build both apps against a
 * database that is not there (see .github/workflows/ci.yml).
 *
 * But the catch used to sit INSIDE the function `unstable_cache` wrapped, which
 * meant a single failed query returned `[]` as a perfectly good result and
 * cached it under the stock tag for REVALIDATE_SECONDS. Every product page
 * 404ed for five minutes, and those 404s were cached too. A thrown error is
 * never cached, so throwing inside and catching here keeps the tag/revalidate
 * behaviour identical while making a failure cost one request, not 300 seconds.
 */
function tolerant<A extends unknown[], T>(
  cached: (...args: A) => Promise<T>,
  where: string,
  fallback: () => T
): (...args: A) => Promise<T> {
  return async (...args: A) => {
    try {
      return await cached(...args);
    } catch (error) {
      reportError(error, { where });
      return fallback();
    }
  };
}

// Invalidate pre-segment projections retained by the Data Cache across deploys.
const cachedStock = unstable_cache(fetchStock, ["stock", "segments-v1", "availability-v1"], {
  tags: [STOCK_TAG],
  revalidate: REVALIDATE_SECONDS,
});

/** Cached across requests. Invalidated by the ops app through /api/revalidate. */
export const getStock = tolerant(cachedStock, "web/getStock", () => []);

async function fetchVocabulary(stock: Equipment[]): Promise<Vocabulary> {
  const client = createPublicClient();

  const [
    { data: categories, error: categoriesError },
    { data: divisions, error: divisionsError },
    { data: tags, error: tagsError },
  ] = await Promise.all([
    client
      .from("public_categories")
      .select("name, icon, blurb, position, division_slug, division_name, division_position")
      .order("position"),
    client.from("divisions").select("slug, name, blurb, position").order("position"),
    client.from("tags").select("name, slug, position").order("position"),
  ]);

  // Thrown, not swallowed: an empty vocabulary must never be cached as a fact.
  const failure = categoriesError ?? divisionsError ?? tagsError;
  if (failure) throw failure;

  // Counts come from the stock we already have rather than the view's own
  // count, so the tile and the catalogue can never disagree about how many
  // fryers there are.
  const counts = new Map<string, number>();
  for (const item of stock) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);

  const divisionCounts = new Map<string, number>();
  for (const item of stock)
    for (const segment of item.segments) divisionCounts.set(segment, (divisionCounts.get(segment) ?? 0) + 1);

  return {
    divisions: (divisions ?? []).map((d: any) => ({
      slug: d.slug,
      name: d.name,
      blurb: d.blurb ?? "",
      count: divisionCounts.get(d.slug) ?? 0,
    })),
    categories: (categories ?? [])
      // Divisions first, categories in their own order inside each — the same
      // two-level ordering the intake dropdown uses. PostgREST cannot sort on
      // two columns of a view and a derived one, so the outer level is done
      // here; the sort is stable, so the `position` order above survives it.
      .slice()
      .sort((a: any, b: any) => (a.division_position ?? 0) - (b.division_position ?? 0))
      .map((c: any) => ({
        name: c.name,
        icon: c.icon ?? "solar:box-linear",
        blurb: c.blurb ?? "",
        count: counts.get(c.name) ?? 0,
        divisionSlug: c.division_slug ?? "uncategorised",
        division: c.division_name ?? "Uncategorised",
      })),
    // Items carry tag SLUGS, so the filter vocabulary has to be slugs too.
    tags: (tags ?? []).map((t: any) => t.slug),
  };
}

const cachedVocabulary = unstable_cache(fetchVocabulary, ["vocabulary"], {
  tags: [STOCK_TAG],
  revalidate: REVALIDATE_SECONDS,
});

const EMPTY_VOCABULARY: Vocabulary = { divisions: [], categories: [], tags: [] };

export const getVocabulary = tolerant(cachedVocabulary, "web/getVocabulary", () => EMPTY_VOCABULARY);

export async function getBySlug(slug: string): Promise<Equipment | undefined> {
  const stock = await getStock();
  return stock.find((item) => item.slug === slug);
}

/**
 * Category slugs and names, for the enquiry form's chips.
 *
 * Separate from getVocabulary(), which returns display names and counts for the
 * catalogue tiles. The form needs the SLUG: capture_lead() resolves it into a
 * real category_id server-side, and a lead filed under a category the matcher
 * recognises scores thirty points where free text alone scores eight.
 */
const cachedCategoryChoices = unstable_cache(
  async (): Promise<CategoryChoice[]> => {
    const client = createPublicClient();
    const { data, error } = await client
      .from("public_categories")
      .select("slug, name, position, division_slug, division_name, division_position")
      .order("position");
    if (error) throw error;
    return (data ?? [])
      .filter((row): row is NonNullable<typeof row> & { slug: string; name: string } =>
        !!row.slug && !!row.name
      )
      // Grouped in the form, so the two lines have to arrive together rather
      // than interleaved by their per-division positions.
      .slice()
      .sort((a, b) => (a.division_position ?? 0) - (b.division_position ?? 0))
      .map((row) => ({
        slug: row.slug,
        name: row.name,
        divisionSlug: row.division_slug ?? "uncategorised",
        division: row.division_name ?? "Other",
      }));
  },
  ["category-choices"],
  { tags: [STOCK_TAG], revalidate: REVALIDATE_SECONDS }
);

export const getCategoryChoices = tolerant(
  cachedCategoryChoices,
  "web/getCategoryChoices",
  () => []
);

/**
 * Everything the detail gallery shows — full-size photos AND video.
 *
 * Staff order is respected WITHIN each kind, but video is forced to the tail
 * regardless of where it was uploaded. That rule lives here rather than in the
 * ops app because it is a property of how the storefront plays a gallery — it
 * runs the photos on a timer and finishes on the clip — and a rule enforced in
 * the data layer is true for every item that will ever be listed, including the
 * ones added by someone who never read this comment.
 */
export async function getGallery(slug: string): Promise<GalleryMedia[]> {
  const client = createPublicClient();
  const { data: item } = await client
    .from("public_items")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!item) return [];

  const { data: media } = await client
    .from("public_item_media")
    .select("kind, storage_path, external_url, position")
    .eq("item_id", (item as any).id)
    .order("position");

  return (media ?? [])
    .map((m: any): GalleryMedia | null => {
      const kind = m.kind === "video" ? "video" : "photo";
      const url = kind === "video" ? videoUrl(m) : imageUrl(m, 1600);
      return url ? { kind, url } : null;
    })
    .filter((slot): slot is GalleryMedia => slot !== null)
    // Stable sort, so photos keep the order staff gave them and video lands last.
    .sort((a, b) => Number(a.kind === "video") - Number(b.kind === "video"));
}
