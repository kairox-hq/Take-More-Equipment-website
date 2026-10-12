"use client";

import { type ReactNode } from "react";
import { useSegmentStock } from "./useSegmentStock";
import { useSegment } from "./SegmentProvider";
import SegmentSwitcher from "./SegmentSwitcher";
import Hero from "./Hero";
import FeaturedStock from "./FeaturedStock";
import Catalogue from "./Catalogue";
import CtaBand from "./CtaBand";
import BuyingInfo from "./BuyingInfo";
import Subheading from "./Subheading";
import type { Equipment, Vocabulary, CategoryChoice } from "@/data/equipment";

export default function HomeStorefront({ stock, vocabulary, categories, formEnabled, process, proof, about, footer }: {
  stock: Equipment[]; vocabulary: Vocabulary; categories: CategoryChoice[]; formEnabled: boolean;
  process: ReactNode; proof: ReactNode; about: ReactNode; footer: ReactNode;
}) {
  const { segment } = useSegment();
  const home = segment === "homestaging";
  const { selectedStock, scopedVocabulary, featured } = useSegmentStock(stock, vocabulary, segment);
  const choices = categories.filter((c) => c.divisionSlug === segment);
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div data-segment-surface><Hero /></div>
      <SegmentSwitcher />
      <div data-segment-surface>{featured.length > 0 && <FeaturedStock items={featured} />}</div>
      <div data-segment-surface><Catalogue key={segment} stock={selectedStock} vocabulary={scopedVocabulary} segment={segment} /></div>
      <div data-segment-surface>{home ? <HomeStory kind="discovery" /> : about}</div>
      {!home && <div data-segment-surface>{process}</div>}
      <div data-segment-surface>{home ? <HomeStory kind="details" /> : proof}</div>
      {home && <div data-segment-surface><HomeStory kind="visit" /></div>}
      <div data-segment-surface><BuyingInfo /></div>
      <div data-segment-surface><CtaBand key={segment} categories={choices} formEnabled={formEnabled} homestaging={home} /></div>
      <div data-segment-surface>{footer}</div>
    </div>
  );
}

function HomeStory({ kind }: { kind: "discovery" | "details" | "visit" }) {
  if (kind === "details") return (
    <section className="px-6 md:px-12 py-14 md:py-24 max-w-[1440px] w-full mx-auto">
      <Subheading text="Find Your Next Piece" />
      <div className="grid md:grid-cols-3 gap-5 mt-8">
        {[
          ["01", "Furniture with character", "Everyday essentials, statement pieces and unexpected finds. Explore what is available right now."],
          ["02", "The details that matter", "Check the photographs, dimensions and condition of each piece. Ask us if you need a closer look."],
          ["03", "Make room for something good", "Visit the warehouse to see your favourite pieces in person, then arrange collection or ask about delivery."],
        ].map(([number, title, copy]) => <div key={number} className="bg-card border border-border rounded-[2rem] p-7 md:p-9">
          <span className="text-accent text-sm">{number}</span><h3 className="text-xl tracking-tight mt-8 mb-3">{title}</h3>
          <p className="text-muted text-sm font-light leading-relaxed">{copy}</p>
        </div>)}
      </div>
    </section>
  );
  const visit = kind === "visit";
  return (
    <section className="px-6 md:px-12 py-14 md:py-24 max-w-[1440px] w-full mx-auto">
      <div className="grid md:grid-cols-2 gap-8 md:gap-20 items-start border-t border-border pt-12">
        <div><Subheading text={visit ? "Come See What You Find" : "The Treasure Hunt"} />
          <h2 className="text-3xl md:text-5xl tracking-tight leading-tight max-w-xl">{visit ? "Some pieces are even better in person." : "Great pieces. Unexpected prices."}</h2>
        </div>
        <div className="pt-3"><p className="text-muted text-base font-light leading-relaxed mb-7">{visit
          ? "Visit our Montague Gardens warehouse to explore furniture and home finds, check the details and imagine each piece in your space."
          : "From a beautiful cabinet to the chair that finishes a room, the best finds are not always the ones you were looking for. Discover furniture and decor with character, for your home or your next staging project."}</p>
          <a href={visit ? "/delivery" : "#catalogue"} className="inline-flex gap-3 items-center text-sm text-accent hover:text-white transition-colors">{visit ? "Plan your visit" : "Explore the collection"}<span aria-hidden="true">↗</span></a>
        </div>
      </div>
    </section>
  );
}
