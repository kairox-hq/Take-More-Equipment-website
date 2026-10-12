import Link from "next/link";
import { site } from "@/data/site";
import Subheading from "./Subheading";
export default function BuyingInfo() {
  return <section className="px-6 md:px-12 py-14 md:py-20 max-w-[1440px] w-full mx-auto">
    <Subheading text="Better In Person" />
    <h2 className="text-3xl md:text-5xl tracking-tight mb-5">Come see what you find.</h2>
    <p className="text-muted font-light max-w-2xl mb-8">Explore our range of catering equipment, furniture and home finds—all under one roof.</p>
    <div className="grid md:grid-cols-3 gap-6">
      <div className="border-t border-border pt-6"><h3 className="text-xl mb-3">Visit the warehouse</h3><p className="text-sm text-muted mb-4">{site.address}</p><Link href="/about#visit" className="text-accent text-sm">Directions &amp; opening hours →</Link></div>
      <div className="border-t border-border pt-6"><h3 className="text-xl mb-3">Collection &amp; delivery</h3><p className="text-sm text-muted mb-4">Collect your purchase from us or let us arrange delivery. Delivery is quoted separately.</p><Link href="/delivery" className="text-accent text-sm">Delivery &amp; collection →</Link></div>
      <div className="border-t border-border pt-6"><h3 className="text-xl mb-3">Ways to pay</h3><p className="text-sm text-muted mb-4">Card · Bank transfer · PayJustNow · Lay-by · 7-day reservation · Finance</p><p className="text-xs text-muted mb-4">Choose a payment option that suits you. PayJustNow and finance are subject to approval and the provider’s terms.</p><Link href="/payment-options" className="text-accent text-sm">See the options →</Link></div>
    </div>
  </section>;
}
