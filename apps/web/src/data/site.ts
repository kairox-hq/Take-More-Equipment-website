/**
 * Brand and contact details, as the rest of the site consumes them.
 *
 * The values themselves live in `./launch.ts` alongside a record of whether
 * anybody has verified them. This module is the flat, convenient shape — and
 * the place the production gate fires, because every page imports it.
 *
 * assertProductionReady() runs here, at module load, because every page imports
 * this file. While `launchState` is "pre-launch" it warns and the build
 * proceeds; once that is flipped to "live" it throws, so a storefront whose
 * CTAs point at an invented number cannot deploy. Local and preview builds are
 * unaffected either way.
 */
import { assertProductionReady, contact, claims, publishedValue } from "./launch.ts";

assertProductionReady();

export const site = {
  name: "Take More",
  legalName: contact.legalName.value,
  city: "Cape Town",
  country: "South Africa",
  domain: contact.domain.value,

  phone: contact.phone.value,
  whatsapp: contact.whatsapp.value,
  email: contact.email.value,
  address: contact.address.value,
  hours: contact.hours.value,
  facebook: "https://www.facebook.com/p/Take-More-Equipment-61590585090265/",

  registrationNumber: contact.registrationNumber.value,
  informationOfficer: contact.informationOfficer.value,
} as const;

export const whatsappLink = (message: string) =>
  `https://wa.me/${site.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;

/**
 * Where this site actually answers, for links that leave it.
 *
 * `site.domain` is where it will answer — a launch fact, unverified until
 * somebody points the domain here. A WhatsApp message is not the place to
 * discover the difference: a customer taps the link from their phone and either
 * lands on the machine or on a registrar's parking page, and we never hear
 * which. So the deployment's own URL wins while there is one, and the domain is
 * the fallback it grows into.
 *
 * NEXT_PUBLIC_ because the value is inlined at build time and read in components
 * that may render on either side. Changing it needs a redeploy, like every other
 * NEXT_PUBLIC_ variable.
 */
export const storefrontOrigin = (): string =>
  (process.env.NEXT_PUBLIC_STOREFRONT_URL || `https://${site.domain}`).replace(/\/+$/, "");

/** The public page for one machine, absolute, safe to paste into a chat. */
export const productUrl = (slug: string): string =>
  `${storefrontOrigin()}/stock/${slug}`;

/**
 * The enquiry a customer sends about one machine.
 *
 * Built here rather than at each call site so the catalogue, the detail page and
 * anything added later all send the same shape — and so the two things that make
 * it answerable are never left out by whoever writes the next one:
 *
 *   the CODE, because "the fridge" is four machines and A042 is one. It is what
 *   the reply quotes, what the salesperson types into the order screen, and what
 *   makes a screenshot of this page identifiable at all.
 *
 *   the LINK, because a chat that starts with the photo, the price and the
 *   condition already agreed is a shorter chat.
 *
 * Blank lines are deliberate: WhatsApp renders them, and a wall of one sentence
 * hides the code inside it.
 */
export const productEnquiry = (item: {
  sku?: string;
  brand?: string;
  title: string;
  slug: string;
  price?: number;
  sold?: boolean;
}): string => {
  const name = [item.brand, item.title].filter(Boolean).join(" ");
  const headline = item.sku ? `${item.sku} — ${name}` : name;
  const price =
    typeof item.price === "number" && item.price > 0
      ? `\nR${item.price.toLocaleString("en-ZA")}`
      : "";

  return item.sold
    ? `Hi Take More, this one has sold:\n\n${headline}\n${productUrl(item.slug)}\n\nCan you watch for another one like it?`
    : `Hi Take More, I'm interested in this:\n\n${headline}${price}\n${productUrl(item.slug)}\n\nIs it still available?`;
};

/**
 * Marketing claims that are withheld until verified, for the handful of places
 * that render them as prose rather than as a stat tile. Null means "we have not
 * checked this", and the copy around it has to cope — see /about, where the
 * sentence is rewritten rather than left with a gap in it.
 */
export const savingRange = () => publishedValue(claims.pricedBelowNewRange);
export const newLineCost = () => publishedValue(claims.newLineCost);
