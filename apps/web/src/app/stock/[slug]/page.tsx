import BrowseMore from "@/components/BrowseMore";

import { AVAILABILITY_LABELS, gradeLabel } from "@takemore/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Subheading from "@/components/Subheading";
import EnquiryForm from "@/components/EnquiryForm";
import ProductGallery from "@/components/ProductGallery";
import { Breadcrumbs } from "@/components/PageShell";
import {
  cm,
  deliveryFor,
  priceLabel,
  rands,
  savingPercent,
} from "@/data/equipment";
import { getBySlug, getGallery, getStock } from "@/lib/stock";
import { enquiryFormEnabled } from "@/lib/forms";
import { productEnquiry, site, whatsappLink } from "@/data/site";

/**
 * Prebuild a page for everything published at build time.
 *
 * `dynamicParams` stays true (its default) deliberately: an item published
 * thirty seconds after a deploy is not in this list, and must still resolve on
 * first request rather than 404. Turning it off to "404 unknown slugs faster"
 * would build a machine that 404s new stock.
 */
export async function generateStaticParams() {
  const stock = await getStock();
  return stock.map((item) => ({ slug: item.slug }));
}

/**
 * How to name a machine in a sentence.
 *
 * Plenty of auction stock reaches us with the badge missing, and `brand` is an
 * empty string when it does. Interpolating it straight into a title gives
 * " Countertop Convection Oven" with a leading space, which is the sort of
 * thing that reaches a search result and a WhatsApp preview before anybody
 * notices it.
 */
const named = (item: { brand: string; title: string }) =>
  [item.brand, item.title].filter(Boolean).join(" ");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = await getBySlug(slug);
  if (!item) return { title: "Not found — Take More" };

  return {
    title: `${named(item)} — ${priceLabel(item.price)} | Take More`,
    description: item.description.slice(0, 155),
    alternates: { canonical: `/stock/${item.slug}` },
    openGraph: {
      title: `${named(item)} — ${priceLabel(item.price)}`,
      description: item.description.slice(0, 155),
      images: item.images.length ? [item.images[0]] : [],
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const item = await getBySlug(slug);
  if (!item) notFound();

  // Null rather than "Save -20%" when the retail anchor sits below our own ask.
  const unavailable = item.sold || (item.availability ?? "available") !== "available";
  const saving = savingPercent(item.price, item.retailPrice);
  const delivery = deliveryFor(item);
  const formEnabled = enquiryFormEnabled();

  /**
   * schema.org Product, for the rich result. Only facts already on the page:
   * the price is omitted rather than sent as 0 when a unit is unpriced, and
   * `<` is escaped so a description can never close the script tag.
   */
  const canonical = `https://${site.domain}/stock/${item.slug}`;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: named(item),
    ...(item.images.length ? { image: item.images } : {}),
    ...(item.description ? { description: item.description } : {}),
    ...(item.sku ? { sku: item.sku } : {}),
    ...(item.brand ? { brand: { "@type": "Brand", name: item.brand } } : {}),
    itemCondition: "https://schema.org/RefurbishedCondition",
    url: canonical,
    offers: {
      "@type": "Offer",
      url: canonical,
      priceCurrency: "ZAR",
      ...(item.price > 0 ? { price: item.price } : {}),
      itemCondition: "https://schema.org/RefurbishedCondition",
      availability: unavailable ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      seller: { "@type": "Organization", name: site.legalName },
    },
  };
  const structuredDataJson = JSON.stringify(structuredData).replace(/</g, "\\u003c");
  // Full-size renditions plus any video, for the gallery; the card-sized photos
  // on `item` are deliberately smaller and photos-only.
  const gallery = await getGallery(slug);
  const [width, depth, height] = item.dimensionsMm;

  /**
   * A row we cannot fill is left out, not filled with a zero.
   *
   * The rule the subcategory row already followed, applied to the rest of the
   * table: a machine nobody weighed has no weight, and printing "0 kg" for it
   * is not a gap in the page, it is a false specification on a public listing.
   * Same for an unmeasured dimension at "0 cm" and for a brand that was never
   * badged, which rendered as a labelled row with nothing beside it.
   *
   * The mapper in src/lib/stock.ts already uses 0 as the "not known" sentinel
   * for weight — deliveryFor() guards on `weightKg > 0` — so this reads it the
   * same way rather than inventing a second convention. Capacity and Power keep
   * their "—", which is a deliberate choice made there: every machine has both,
   * and the dash says "ask us" where an absent row would say "not applicable".
   */
  const known = (label: string, value: string | null): [string, string][] =>
    value ? [[label, value]] : [];
  const mm = (value: number) => (value > 0 ? cm(value) : null);

  const specs: [string, string][] = [
    ...known("Brand", item.brand),
    ["Category", item.category],
    ...known("Type", item.subcategory ?? null),
    ["Capacity", item.capacity],
    ["Power", item.power],
    ...known("Width", mm(width)),
    ...known("Depth", mm(depth)),
    ...known("Height", mm(height)),
    ...known("Weight", item.weightKg > 0 ? `${item.weightKg} kg` : null),
    ["Condition", gradeLabel(item.grade)],
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: structuredDataJson }}
      />
      <Navbar variant="solid" />

      <main className="flex-1 w-full max-w-[1440px] mx-auto px-6 md:px-12 pt-4 md:pt-8 pb-16 md:pb-24">
        <Breadcrumbs
          crumbs={[
            { label: "Home", href: "/" },
            { label: "Stock", href: "/#catalogue" },
            { label: item.category, href: "/#catalogue" },
            { label: item.title },
          ]}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-10 lg:gap-16">
          <ProductGallery media={gallery} title={item.title} sold={item.sold} />

          <div className="flex flex-col">
            <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-5 flex-wrap">
              {/* Unbadged stock has no brand. An empty pill is worse than no pill. */}
              {item.brand && (
                <span className="glass-panel px-4 py-1.5 rounded-full text-xs font-medium tracking-widest uppercase">
                  {item.brand}
                </span>
              )}
              <span className="px-4 py-1.5 rounded-full border border-border text-xs font-light text-muted">
                {item.category}
              </span>
              <span className="px-4 py-1.5 rounded-full border border-border text-xs font-light text-muted">
                {gradeLabel(item.grade)}
              </span>
              {/*
                The code, last in the row and quiet on purpose. It is not a
                selling point — it is the handle. A customer sends a screenshot
                of this page and A042 is what tells us which of four fridges
                they meant; tabular-nums keeps it legible at a glance.
              */}
              {item.sku && (
                <span className="px-4 py-1.5 rounded-full border border-border/60 text-xs font-light text-muted/80 tabular-nums tracking-widest">
                  {item.sku}
                </span>
              )}
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tighter leading-[1.1] mb-6">
              {item.title}
            </h1>

            <p className="text-muted font-light text-sm md:text-base leading-relaxed mb-6 md:mb-8">
              {item.description}
            </p>

            {item.availability && item.availability !== "available" && <p role="status" className="text-accent text-sm mb-5">{AVAILABILITY_LABELS[item.availability]}. This item cannot be bought at the moment.</p>}
            {!unavailable && item.availableQuantity !== undefined && <p role="status" className="text-accent text-sm mb-5">{item.availableQuantity} available · Price per unit</p>}
            {/* Price block */}
            <div className="bg-card rounded-[2rem] border border-border p-5 sm:p-6 md:p-8 mb-4 sm:mb-6">
              <div className="flex items-end justify-between gap-6 flex-wrap">
                <div className="flex flex-col">
                  <span className="text-xs text-muted font-light mb-1">
                    {item.sold ? "Sold for" : "Our price"}
                  </span>
                  <span className="text-3xl sm:text-4xl md:text-5xl font-light tracking-tighter">
                    {priceLabel(item.price)}
                  </span>
                </div>
                {item.retailPrice && (
                  <div className="flex flex-col items-end">
                    <span className="text-sm font-light text-muted line-through">
                      {rands(item.retailPrice)} new
                    </span>
                    {saving !== null && (
                      <span className="text-accent text-lg font-light tracking-tight">
                        Save {saving}%
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-4 mt-8">
                {item.sold ? (
                  <a
                    href={whatsappLink(productEnquiry(item))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-between gap-3 bg-accent text-background rounded-2xl px-6 py-4 hover:opacity-90 transition-opacity"
                  >
                    <span className="text-sm font-medium">Find me one like it</span>
                    <iconify-icon icon="solar:arrow-right-linear" width="18" height="18"></iconify-icon>
                  </a>
                ) : (
                  <a
                    href={whatsappLink(productEnquiry(item))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-between gap-3 bg-accent text-background rounded-2xl px-6 py-4 hover:opacity-90 transition-opacity"
                  >
                    <span className="text-sm font-medium">{unavailable ? "Ask about availability" : "Enquire on WhatsApp"}</span>
                    <iconify-icon icon="solar:chat-round-line-linear" width="18" height="18"></iconify-icon>
                  </a>
                )}
                <a
                  href={`tel:${site.phone.replace(/\s/g, "")}`}
                  className="flex-1 flex items-center justify-between gap-3 border border-border rounded-2xl px-6 py-4 hover:border-white/25 transition-colors"
                >
                  <span className="text-sm font-light">{site.phone}</span>
                  <iconify-icon
                    icon="solar:phone-linear"
                    width="18"
                    height="18"
                    className="text-accent"
                  ></iconify-icon>
                </a>
              </div>

              {!unavailable && (
                <p className="text-xs font-light text-muted mt-5">
                  View the item at our warehouse before buying. A 50% deposit holds an item for seven days, subject to the agreed reservation period.
                </p>
              )}
            </div>

            {/* Delivery + viewing */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoCard
                icon="solar:delivery-linear"
                title={delivery.headline}
                copy={delivery.detail}
              />
              <InfoCard
                icon="solar:map-point-linear"
                title={item.availability === "on_hire" ? "View when it returns" : "See it in person"}
                copy={item.availability === "on_hire" ? "Contact our team to arrange a viewing once the equipment returns to our warehouse." : "Visit our Montague Gardens warehouse to inspect the item and ask your questions before choosing."}
              />
            </div>

            {/*
              The capture, under the WhatsApp button rather than instead of it.
              A ready buyer taps WhatsApp; this is for the visitor who is not
              ready today and would otherwise leave without a trace.

              On a sold unit it is the highest-intent form on the site — they
              came for a specific machine and it is gone — so it moves up the
              page and changes its wording.
            */}
            <EnquiryForm
              mode={item.sold ? "sold" : "product"}
              itemSlug={item.slug}
              itemTitle={item.title}
              className="mt-4"
              enabled={formEnabled}
            />
          </div>
        </div>

        {/* Product specifications and purchase arrangements */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-10 lg:gap-16 mt-16 md:mt-24">
          <section>
            <Subheading text="Specification" />
            <h2 className="text-xl sm:text-2xl md:text-3xl font-medium tracking-tight mb-8">
              The numbers
            </h2>
            <dl className="flex flex-col">
              {specs.map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-6 py-3.5 border-b border-border"
                >
                  <dt className="text-sm font-light text-muted">{label}</dt>
                  <dd className="text-sm font-light text-white/90 text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <Subheading text="Before You Buy" />
            <h2 className="text-xl sm:text-2xl md:text-3xl font-medium tracking-tight mb-6">Collection &amp; delivery</h2>
            <p className="text-sm text-muted font-light leading-relaxed mb-6">Read our policy before purchasing or arranging transport. Check measurements, access and any connection requirements with our team.</p>
            <div className="flex flex-col gap-4 text-sm text-accent">
              <Link href="/before-you-buy">Before you buy — collection &amp; delivery →</Link>
              <Link href="/conditions">Our condition guide →</Link>
            </div>
          </section>
        </div>

      </main>

      <BrowseMore excludeSlug={item.slug} />
      <Footer />
    </div>
  );
}

function InfoCard({
  icon,
  title,
  copy,
}: {
  icon: string;
  title: string;
  copy: string;
}) {
  return (
    <div className="bg-card rounded-[2rem] border border-border p-6">
      <div className="w-11 h-11 rounded-2xl bg-background border border-border flex items-center justify-center text-accent mb-5">
        <iconify-icon icon={icon} width="20" height="20"></iconify-icon>
      </div>
      <h3 className="text-base font-medium tracking-tight mb-2">{title}</h3>
      <p className="text-xs font-light text-muted leading-relaxed">{copy}</p>
    </div>
  );
}
