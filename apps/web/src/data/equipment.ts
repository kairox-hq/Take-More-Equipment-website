import type { PublicAvailability, Segment } from "@takemore/core";
/**
 * The storefront's view model.
 *
 * This file used to hold seventeen hand-written machines. It now holds only the
 * shape they had and the pure functions that work on it — the data itself comes
 * from Supabase via src/lib/stock.ts.
 *
 * Prices here are RANDS, not cents. The database and @takemore/core both work
 * in cents, and the single conversion happens in the mapper in src/lib/stock.ts.
 * Keeping this boundary means the components below did not have to change when
 * the data source did.
 */

export { CONDITION_GRADES as GRADES } from "@takemore/core";
import { DELIVERY_RULE_LABEL, CONDITION_GRADES as GRADES } from "@takemore/core";
export type Grade = (typeof GRADES)[number];

/**
 * Categories and tags are lookup tables in the database now, so these are plain
 * strings rather than the closed unions they were — staff can add a seventh
 * category without a deploy, and the site has to render whatever comes back.
 */
export type Category = string;
export type Tag = string;

/**
 * The line of business a category belongs to — catering equipment, or the
 * furniture and decor sold for homestaging. One level above the category, and
 * a lookup table like it, so this is a plain string too.
 */
export type Division = string;

export type Equipment = {
  slug: string;
  /**
   * The short code written on the machine itself — `A042`. Optional because a
   * row that predates the renumbering, or a view that stops exposing it, must
   * degrade to a page without a code rather than to a page that says
   * "undefined". Every caller treats an absent code as "do not show one".
   */
  sku?: string;
  title: string;
  brand: string;
  /** Display name of the line of business, e.g. "Homestaging". */
  division: Division;
  /**
   * The same thing as a slug. Both are carried because they do different jobs:
   * the name is what a visitor reads on the switcher, the slug is what the
   * filter compares against — and display copy is exactly the sort of thing
   * that gets reworded, which should not silently empty the catalogue.
   */
  divisionSlug: string;
  segments: Segment[];
  category: Category;
  /** The second level of the tree, where one has been chosen. Optional by design. */
  subcategory?: string;
  /** What we're asking, in rands. */
  price: number;
  /** Comparable new price, for the saving anchor. Omit if we can't back it up. */
  retailPrice?: number;
  /** A–C, mirrors items.condition_grade */
  grade: Grade;
  capacity: string;
  power: string;
  tags: Tag[];
  /** First entry is the card image. */
  images: string[];
  description: string;
  /** width × depth × height, in millimetres. */
  dimensionsMm: [number, number, number];
  weightKg: number;
  /** Sold units stay listed with a badge until a human unpublishes them. */
  sold?: boolean;
  availability?: PublicAvailability;
  availableQuantity?: number;
  /** Surfaced in the highlighted row above the catalogue. */
  featured?: boolean;
  /** ISO timestamp of publication, when the view supplied one. Feeds the sitemap. */
  publishedAt?: string;
};

/**
 * One slot in the detail-page gallery.
 *
 * Photos and video share the strip rather than sitting in separate sections —
 * a walkaround clip of a fridge running is the same kind of evidence as a photo
 * of it, and burying it under the specs is how it goes unwatched. `Equipment.images`
 * above stays photos-only on purpose: it feeds cards, the search overlay and the
 * OG tag, none of which can render a video.
 */
export type GalleryMedia = {
  kind: "photo" | "video";
  url: string;
};

/** The filter vocabulary, derived from the database rather than hardcoded. */
export type CategoryMeta = {
  name: string;
  icon: string;
  blurb: string;
  count: number;
  /** Which line of business this category sits under. */
  divisionSlug: string;
  division: Division;
};

/**
 * One chip in the enquiry form, and the line of business it sits under.
 *
 * Lives here rather than beside the query that builds it because the form is a
 * client component, and `lib/stock.ts` is server-only.
 */
export type CategoryChoice = {
  slug: string;
  name: string;
  divisionSlug: string;
  division: Division;
};

export type DivisionMeta = {
  slug: string;
  name: string;
  blurb: string;
  /** Published units across every category in this line. */
  count: number;
};

export type Vocabulary = {
  /** In the order the shop offers them. */
  divisions: DivisionMeta[];
  /** Ordered by division first, then by the category's own position. */
  categories: CategoryMeta[];
  tags: string[];
};

/**
 * The lines that actually have something on the site.
 *
 * A switcher offering "Homestaging" that leads to an empty grid is worse than
 * no switcher at all, and the same is true of a filter heading. Every surface
 * that splits the catalogue in two asks this first, so they can never disagree
 * about whether the split exists.
 */
export const stockedDivisions = (vocabulary: Vocabulary) =>
  vocabulary.divisions.filter((division) => division.count > 0);

/**
 * Related stock: same category first, then anything in a similar price bracket,
 * so a page always fills its row even in a thin category.
 */
export function relatedTo(
  stock: readonly Equipment[],
  item: Equipment,
  limit = 3
): Equipment[] {
  const others = stock.filter((candidate) => candidate.slug !== item.slug && candidate.segments.some((s) => item.segments.includes(s)));
  const sameCategory = others.filter((c) => c.category === item.category);
  const byPrice = others
    .filter((c) => c.category !== item.category)
    .sort((a, b) => Math.abs(a.price - item.price) - Math.abs(b.price - item.price));
  return [...sameCategory, ...byPrice].slice(0, limit);
}


/** Light items go on a courier; anything heavy is delivered or collected. */
export function deliveryFor(item: Equipment) {
  return item.weightKg > 0 && item.weightKg <= 30
    ? {
        headline: "Nationwide courier",
        detail: "2–4 working days to most major centres, quoted on enquiry.",
      }
    : {
        headline: "Delivered or collected",
        detail:
          `Collect from Montague Gardens or arrange delivery: ${DELIVERY_RULE_LABEL}.`,
      };
}

export const PRICE_BANDS = [
  { id: "under-5k", label: "Under R5 000", min: 0, max: 5000 },
  { id: "5k-15k", label: "R5 000 – R15 000", min: 5000, max: 15000 },
  { id: "15k-50k", label: "R15 000 – R50 000", min: 15000, max: 50000 },
  { id: "over-50k", label: "Over R50 000", min: 50000, max: Infinity },
] as const;
export type PriceBandId = (typeof PRICE_BANDS)[number]["id"];

/**
 * R42 500.
 *
 * Worth knowing, because it looks like a bug: `toLocaleString("en-ZA")` groups
 * with a NON-BREAKING space, not a comma, so the `.replace(/,/g, " ")` this
 * helper used to carry never matched anything. The nbsp was always what shipped
 * — and it is the better character, because it stops a price wrapping across
 * two lines. Kept deliberately.
 */
export const rands = (amount: number) => `R${amount.toLocaleString("en-ZA")}`;

/**
 * What the visitor reads where a price goes.
 *
 * The mapper uses 0 as the "not priced" sentinel, and "R0" on a card, in a
 * <title> and in a WhatsApp preview reads as a free machine — or a broken site.
 * Every place a price is rendered goes through here, so an unpriced unit says
 * the same honest thing everywhere.
 */
export const PRICE_ON_REQUEST = "Price on request";
export const priceLabel = (amount: number) => (amount > 0 ? rands(amount) : PRICE_ON_REQUEST);

/**
 * The percentage saved against new, or null when there is nothing honest to
 * say — no retail anchor, no price yet, or a retail figure below our own ask
 * (which would render as "Save -20%").
 */
export const savingPercent = (price: number, retailPrice?: number): number | null => {
  if (!retailPrice || price <= 0 || retailPrice <= price) return null;
  const saving = Math.round(((retailPrice - price) / retailPrice) * 100);
  return saving > 0 ? saving : null;
};

/**
 * Millimetres in, centimetres out.
 *
 * The column is millimetres — integer, and fine enough to take the half a
 * centimetre a tape measure actually reads — but nobody shopping for a fridge
 * thinks in millimetres, so the page speaks centimetres. The same split as the
 * prices above, which are cents in the database and rands on the screen.
 */
export const cm = (millimetres: number) =>
  `${(millimetres / 10).toLocaleString("en-ZA", { maximumFractionDigits: 1 })} cm`;
