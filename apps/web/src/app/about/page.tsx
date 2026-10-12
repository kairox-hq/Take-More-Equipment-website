import BrowseMore from "@/components/BrowseMore";
import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { ContentSection } from "@/components/Prose";
import SiteImage from "@/components/SiteImage";
import Stats from "@/components/Stats";
import Subheading from "@/components/Subheading";
import { claims, isVerified, media } from "@/data/launch";
import { site, whatsappLink } from "@/data/site";

export const metadata: Metadata = {
  alternates: { canonical: "/about" },
  title: "About Us — Take More Catering Equipment, Cape Town",
  description: "Second-hand catering equipment, furniture and home finds in Montague Gardens, Cape Town.",
};

const statFacts = [
  claims.machinesRebuilt,
  claims.averageSaving,
  claims.delivery,
];

export default function AboutPage() {
  return (
    <PageShell browse={<BrowseMore />}
      eyebrow="About Us"
      title={<>The kitchen you want. A price that works for you.</>}
      intro="Take More Equipment is a warehouse in Montague Gardens, Cape Town, selling second-hand catering equipment, furniture and home finds. Explore our range in person and find what you need at affordable prices."
      crumbs={[{ label: "Home", href: "/" }, { label: "About Us" }]}
    >
      {/* The whole section goes, border and all, when no stat is verified — a
          lone horizontal rule under an empty block reads as a broken page. */}
      {statFacts.some(isVerified) && (
        <ContentSection>
          <div className="pb-16 border-b border-border">
            <Stats facts={statFacts} />
          </div>
        </ContentSection>
      )}

      <ContentSection>
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-24">
          <div className="lg:w-1/2">
            <Subheading text="Your Budget" />
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight mb-8">
              More equipment within your budget
            </h2>
            <div className="flex flex-col gap-6 text-muted font-light text-sm md:text-base leading-relaxed">
              <p>Setting up or upgrading a commercial kitchen can be expensive. Buying everything new can mean cutting back on the equipment you need to bring your menu to life.</p>
              <p>At Take More Equipment, our second-hand range offers a more affordable way to equip your kitchen. With prices below buying new, you can put more of your budget towards the equipment that matters to your business.</p>
            </div>
          </div>

          <div className="lg:w-1/2">
            <div className="rounded-[2rem] overflow-hidden border border-border">
              <SiteImage
                fact={media.aboutWorkshop}
                className="w-full h-full object-cover aspect-[4/3]"
                fallbackClassName="w-full aspect-[4/3]"
              />
            </div>

          </div>
        </div>
      </ContentSection>

      <ContentSection>
        <div id="visit" className="scroll-mt-24 bg-card rounded-[2rem] border border-border p-6 sm:p-8 md:p-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            <div>
              <Subheading text="Find Us" />
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight mb-6">
                Come see what you find.
              </h2>
              <p className="text-muted font-light text-sm leading-relaxed">
                Explore the warehouse, inspect your favourites and speak to our team.
                From catering equipment to furniture and home finds, the full experience is here.
              </p>
            </div>

            <div className="flex flex-col gap-5">
              <Detail icon="solar:map-point-linear" label="Warehouse" value={site.address} />
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(site.address)}`} target="_blank" rel="noopener noreferrer" className="text-accent text-sm">Get directions →</a>
              <Detail icon="solar:clock-circle-linear" label="Hours" value={site.hours} />
              <Detail icon="solar:phone-linear" label="Phone" value={site.phone} />
              <Detail icon="solar:bill-list-linear" label="Registered" value={site.legalName} />

              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <a
                  href={whatsappLink("Hi Take More, I'd like to arrange a viewing.")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-3 bg-accent text-background rounded-2xl px-6 py-4 hover:opacity-90 transition-opacity"
                >
                  <span className="text-sm font-medium">Arrange a viewing</span>
                  <iconify-icon icon="solar:chat-round-line-linear" width="18" height="18"></iconify-icon>
                </a>
                <Link
                  href="/#catalogue"
                  className="inline-flex items-center gap-3 border border-border rounded-2xl px-6 py-4 hover:border-white/25 transition-colors"
                >
                  <span className="text-sm font-light">Browse stock</span>
                  <iconify-icon icon="solar:arrow-right-linear" width="18" height="18"></iconify-icon>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </ContentSection>
    </PageShell>
  );
}

function Detail({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-4 pb-5 border-b border-border">
      <span className="w-9 h-9 rounded-xl bg-background border border-border flex items-center justify-center text-accent shrink-0">
        <iconify-icon icon={icon} width="16" height="16"></iconify-icon>
      </span>
      <span className="flex flex-col">
        <span className="text-xs font-light text-muted">{label}</span>
        <span className="text-sm font-light text-white/90">{value}</span>
      </span>
    </div>
  );
}
