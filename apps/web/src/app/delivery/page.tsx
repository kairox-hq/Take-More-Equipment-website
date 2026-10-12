import BrowseMore from "@/components/BrowseMore";
import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { DELIVERY_RULE_LABEL } from "@takemore/core";
import { site } from "@/data/site";
export const metadata: Metadata = { title: "Delivery & Collection — Take More", description: "Collect from our Montague Gardens warehouse or arrange delivery. Clear distance-based pricing.", alternates: { canonical: "/delivery" } };
export default function Delivery() {
  return <PageShell browse={<BrowseMore />} eyebrow="Delivery & Collection" title={<>From our warehouse to your space.</>} intro="Collect your purchase, arrange your own transport or ask us for delivery." crumbs={[{label:"Home",href:"/"},{label:"Delivery & Collection"}]}>
    <div className="grid md:grid-cols-2 gap-10 pb-12">
      <section><h2 className="text-2xl mb-4">Collect from us</h2><p className="text-muted font-light mb-4">Visit, inspect your purchase and arrange a collection time with our team. Tell us in advance if you need help loading.</p><p className="text-sm">{site.address}</p><Link href="/about#visit" className="text-accent inline-block mt-4">Directions &amp; opening hours →</Link></section>
      <section><h2 className="text-2xl mb-4">Ask for delivery</h2><p className="text-accent mb-4">{DELIVERY_RULE_LABEL}.</p><p className="text-muted font-light">We confirm the distance, total fee and delivery arrangements with you. Tell us about stairs, narrow entrances or difficult access before booking. Installation and connections are arranged separately.</p></section>
      <section><h2 className="text-2xl mb-4">Using your own transport?</h2><p className="text-muted font-light">You can arrange your own vehicle or courier. Check that it suits the item and coordinate collection with our team.</p></section>
      <section><h2 className="text-2xl mb-4">Check before you collect</h2><p className="text-muted font-light">Check dimensions, access and condition. For equipment, check the electrical, gas, water and plumbing requirements. Ask us for measurements or more photographs if you cannot visit.</p></section>
    </div>
    <div className="flex flex-wrap gap-6 text-sm text-accent"><Link href="/about#visit">Arrange collection or delivery →</Link><Link href="/conditions">Condition &amp; inspection →</Link><Link href="/payment-options">Ways to pay →</Link><Link href="/before-you-buy">Before you buy — collection &amp; delivery →</Link></div>
  </PageShell>;
}
