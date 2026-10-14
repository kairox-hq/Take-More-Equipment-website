import BrowseMore from "@/components/BrowseMore";
import type { Metadata } from "next";
import PageShell from "@/components/PageShell";
import { ContentSection } from "@/components/Prose";
import EnquiryForm from "@/components/EnquiryForm";
import { getCategoryChoices } from "@/lib/stock";
import { enquiryFormEnabled } from "@/lib/forms";
import { site, whatsappLink } from "@/data/site";

/**
 * "Tell us what you are looking for."
 *
 * A standing page for the request the business gets constantly and could never
 * capture: somebody wants a six-burner, we do not have one this week, and
 * without a form the entire conversation happens on WhatsApp and then evaporates.
 *
 * It also gives staff something to send. "Fill this in and I'll message you when
 * one lands" is a better end to a phone call than "try us again next month".
 */

export const metadata: Metadata = {
  alternates: { canonical: "/wanted" },
  title: "Looking for something specific? — Take More",
  description:
    "Tell us what equipment you are looking for and your budget. We will let you know when a suitable item becomes available, with photos and prices.",
};

const steps = [
  {
    icon: "solar:pen-new-square-linear",
    title: "Tell us what you need",
    copy: "The equipment, your budget and any size, power or connection requirements.",
  },
  {
    icon: "solar:magnifer-linear",
    title: "We watch for it",
    copy: "If we don’t have it in stock, we’ll look for it and let you know when something suitable becomes available.",
  },
  {
    icon: "solar:chat-round-line-linear",
    title: "Photos and prices",
    copy: "We’ll send you photos, the price and a description of the item’s condition.",
  },
];

export default async function WantedPage() {
  const categories = await getCategoryChoices();
  const formEnabled = enquiryFormEnabled();

  return (
    <PageShell browse={<BrowseMore />}
      eyebrow="Wanted"
      title="Looking for something specific?"
      intro="Tell us what equipment you’re looking for and your budget. If we don’t have it in stock, we’ll look for it and let you know when it becomes available, with photos and prices."
      crumbs={[{ label: "Home", href: "/" }, { label: "Wanted" }]}
    >
      <ContentSection>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">
          <div>
            <ul className="flex flex-col gap-8">
              {steps.map((step) => (
                <li key={step.title} className="flex items-start gap-5">
                  <span className="w-11 h-11 shrink-0 rounded-2xl bg-card border border-border flex items-center justify-center text-accent">
                    <iconify-icon icon={step.icon} width="20" height="20"></iconify-icon>
                  </span>
                  <div>
                    <h2 className="text-base font-medium tracking-tight mb-1.5">{step.title}</h2>
                    <p className="text-sm font-light text-muted leading-relaxed">{step.copy}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-10 pt-8 border-t border-border">
              <p className="text-sm font-light text-muted leading-relaxed">
                Would rather just talk?{" "}
                <a
                  href={whatsappLink("Hi Take More, I'm looking for the following equipment:")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white hover:text-accent transition-colors"
                >
                  WhatsApp us
                </a>{" "}
                or call {site.phone} to discuss what you’re looking for.
              </p>
            </div>
          </div>

          <EnquiryForm mode="general" categories={categories} enabled={formEnabled} />
        </div>
      </ContentSection>
    </PageShell>
  );
}
