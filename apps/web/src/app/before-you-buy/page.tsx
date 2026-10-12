import type { Metadata } from "next";
import Link from "next/link";
import PageShell from "@/components/PageShell";

export const metadata: Metadata = {
  title: "Before You Buy — Collection & Delivery — Take More",
  description: "Viewing, suitability, access, transport and delivery arrangements before buying from Take More.",
  alternates: { canonical: "/before-you-buy" },
};

const sections = [
  ["Viewing before purchase", [
    "We encourage you to view the item before arranging delivery. If you cannot visit, request additional photos, measurements and any information you need to make sure it suits your needs.",
  ]],
  ["Suitability, access and connections", [
    "Before purchasing, confirm that the item fits your space and can pass through entrances, doorways, passages and stairs. Check the required electrical supply, including single-phase or three-phase power, and any gas, water, tap, drainage or plumbing connections.",
    "Please confirm these details before purchasing, as suitability for your premises is your responsibility. If you’re unsure, our team is happy to help you check what you need.",
  ]],
  ["Delivery charges", [
    "Delivery is charged separately. If an accurately described item is delivered and you change your mind, or have not checked the measurements, access or stated connection requirements, the completed delivery charge remains payable.",
    "Tell us about stairs, narrow entrances or restricted access before arranging delivery. Any additional handling charges will be confirmed beforehand.",
  ]],
  ["Collection and your own transport", [
    "Collection is available during our opening hours. For large purchases, please let us know beforehand when you or your driver expect to collect, so we can prepare the item and assist with loading.",
    "Before booking your own courier or transport, please confirm with us that the item is suitable for your chosen transport method and let us know that they will be collecting.",
    "Ensure your transporter uses a suitable vehicle and handles and secures the item correctly. The item’s condition and, for catering equipment, operation should be checked and recorded before handover. Take More is not responsible for damage caused by your independently appointed courier or transporter after collection.",
  ]],
  ["First come, first served", [
    "Items are available on a first-come, first-served basis. Enquiries, expressions of interest and arrangements to view do not reserve an item. An item is held only once we have received an agreed reservation deposit or full payment. Deposit reservations are subject to the agreed reservation period.",
  ]],
  ["Installation and connections", [
    "Delivery does not include installation or electrical, gas, water or plumbing connections. Any installation assistance must be agreed and quoted separately.",
  ]],
] as const;

export default function BeforeYouBuy() {
  return <PageShell eyebrow="Before You Buy" title={<>Before You Buy — Collection &amp; Delivery</>}
    crumbs={[{ label: "Home", href: "/" }, { label: "Before You Buy" }]}>
    <div className="max-w-3xl space-y-10 pb-12">
      {sections.map(([title, paragraphs], index) => <section key={title}>
        <h2 className="text-xl sm:text-2xl tracking-tight mb-4">{index + 1}. {title}</h2>
        <div className="space-y-4 text-muted font-light leading-relaxed">{paragraphs.map(text => <p key={text}>{text}</p>)}</div>
      </section>)}
      <div className="flex flex-wrap gap-6 text-sm text-accent">
        <Link href="/about#visit">Directions &amp; opening hours →</Link>
        <Link href="/delivery">Delivery &amp; collection →</Link>
      </div>
    </div>
  </PageShell>;
}
