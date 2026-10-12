import BrowseMore from "@/components/BrowseMore";
import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { ContentSection } from "@/components/Prose";
import Subheading from "@/components/Subheading";
import { GRADES } from "@/data/equipment";

export const metadata: Metadata = {
  alternates: { canonical: "/conditions" },
  title: "Condition & Inspection — Take More",
  description:
    "What New, Like New, Used and Fair mean, and what to check when you visit the warehouse.",
};

const grades = {
  N: { headline: "New", copy: "New and unused.", examples: ["Not previously used.", "Check the listing for details."] },
  A: { headline: "Like New", copy: "Previously owned, with a near-new appearance.", examples: ["No significant visible wear.", "Check the listing for details."] },
  B: { headline: "Used", copy: "Visible signs of use, clearly described and photographed.", examples: ["Surface scratches or small dents.", "Check the listing for details."] },
  C: { headline: "Fair", copy: "More noticeable signs of use, with cosmetic wear clearly described and photographed.", examples: ["Visible wear, such as scratches, marks or dents.", "Check the listing for details."] },
};

export default function ConditionsPage() {
  return (
    <PageShell browse={<BrowseMore />}
      eyebrow="Condition & Inspection"
      title={<>Understand each item’s condition</>}
      intro="We clearly describe each item’s condition to help you choose."
      crumbs={[{ label: "Home", href: "/" }, { label: "Condition & Inspection" }]}
    >
      <ContentSection>
        <Subheading text="Condition" />
        <h2 className="text-2xl sm:text-3xl lg:text-4xl font-medium tracking-tight mb-4">
          Our condition guide
        </h2>
        <p className="text-muted font-light text-sm leading-relaxed max-w-2xl mb-12">
          Our condition labels describe each item’s appearance and signs of use. Catering equipment is inspected, repaired and tested before being listed for sale.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {GRADES.map((grade) => (
            <div
              key={grade}
              className="bg-card rounded-[2rem] border border-border p-6 sm:p-8 flex flex-col"
            >
              <h3 className="text-2xl font-medium tracking-tight mb-3">
                {grades[grade].headline}
              </h3>
              <p className="text-muted font-light text-sm leading-relaxed mb-6">
                {grades[grade].copy}
              </p>
              <ul className="flex flex-col gap-2.5 mt-auto pt-6 border-t border-border">
                {grades[grade].examples.map((example) => (
                  <li key={example} className="flex items-start gap-3">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1.5"></span>
                    <span className="text-xs font-light text-muted leading-relaxed">
                      {example}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </ContentSection>

      <ContentSection>
        <p className="text-muted font-light mb-6">Before choosing, read our collection and delivery policy for measurements, access and connection requirements.</p>
        <div className="flex flex-wrap gap-6 text-sm text-accent">
          <Link href="/before-you-buy">Before you buy — collection &amp; delivery →</Link>
          <Link href="/about#visit">Plan your visit →</Link>
        </div>
      </ContentSection>
    </PageShell>
  );
}
