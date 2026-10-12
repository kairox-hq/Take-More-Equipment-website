import type { Metadata } from "next";
import { Figtree } from "next/font/google";
import IconifyLoader from "@/components/IconifyLoader";
import SegmentProvider from "@/components/SegmentProvider";
import { site } from "@/data/site";
import "./globals.css";

const figtree = Figtree({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
  variable: "--font-figtree",
});

/**
 * Warm the connection to Supabase before the first photograph needs it.
 *
 * Every catalogue image is served from this host, so the largest paint on
 * the page otherwise pays DNS + TCP + TLS before its first byte. One line
 * moves that handshake into the idle moment the HTML is still arriving.
 */
const supabaseOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return null;
  }
})();

/**
 * Only the production deployment may be indexed.
 *
 * Every Vercel preview and the local dev server serve the same pages on a
 * different host; without this a *.vercel.app alias can end up in a search
 * result ahead of the real domain. Production stays indexable and every page
 * carries a canonical resolved against metadataBase, so the production alias
 * itself defers to the domain too.
 */
const indexable = process.env.VERCEL_ENV === "production";

export const metadata: Metadata = {
  metadataBase: new URL(`https://${site.domain}`),
  ...(indexable ? {} : { robots: { index: false, follow: false } }),
  title: "Take More — Refurbished Catering Equipment, Cape Town",
  description:
    "Second-hand catering equipment, furniture and home finds at affordable prices. Browse photos and condition descriptions, then visit our Montague Gardens warehouse.",
  openGraph: {
    title: "Take More — Refurbished Catering Equipment, Cape Town",
    description:
      "Quality equipment. Great prices. Browse catering equipment, furniture and home finds, then visit the warehouse.",
    locale: "en_ZA",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    /**
     * suppressHydrationWarning, on <html> and nowhere else.
     *
     * A visitor's extensions write to the root element before React hydrates,
     * and an attribute this codebase never wrote is then a mismatch React blames
     * on this layout. Scoped to this element only — its attributes and its own
     * text — so it does not cascade into <body> and a genuine mismatch anywhere
     * in the site still reports. Mirrors apps/ops, where the same thing happens
     * on staff machines; the reasoning is written out in full there.
     */
    <html lang="en-ZA" className={`dark ${figtree.variable}`} suppressHydrationWarning>
      <body className="bg-background text-foreground antialiased selection:bg-accent selection:text-black">
        {supabaseOrigin && <link rel="preconnect" href={supabaseOrigin} />}
        <IconifyLoader />
        <SegmentProvider>{children}</SegmentProvider>
      </body>
    </html>
  );
}
