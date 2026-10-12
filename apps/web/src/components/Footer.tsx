import Link from "next/link";
import { posts } from "@/data/posts";
import { site } from "@/data/site";

// Footer (Minimal based on design feel)
export default function Footer() {
  return (
    <footer className="w-full max-w-[1440px] mx-auto px-6 md:px-12 py-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-light text-muted">
      <p className="text-center md:text-left">
        &copy; {new Date().getFullYear()} {site.legalName}. {site.address}.
      </p>
      <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2">
        <Link href="/#catalogue" className="hover:text-white transition-colors">
          Stock
        </Link>
        <Link href="/conditions" className="hover:text-white transition-colors">
          Condition &amp; Inspection
        </Link>
        <Link href="/delivery" className="hover:text-white transition-colors">
          Delivery
        </Link>
        <Link href="/payment-options" className="hover:text-white transition-colors">Ways to Pay</Link>
        <Link href="/about" className="hover:text-white transition-colors">
          About
        </Link>
        {/* A nav link to an empty page is worse than no link. */}
        {posts.length > 0 && (
          <Link href="/blog" className="hover:text-white transition-colors">
            Journal
          </Link>
        )}
        <Link href="/wanted" className="hover:text-white transition-colors">
          Wanted
        </Link>
        {/* Reachable from every page, not only from the forms that link to it —
            POPIA s18 is about the person being able to find out what you hold,
            which is not satisfied by a link they only see once. */}
        <Link href="/before-you-buy" className="hover:text-white transition-colors">Before you buy</Link>
        <Link href="/privacy" className="hover:text-white transition-colors">
          Privacy
        </Link>
        <a href={`mailto:${site.email}`} className="hover:text-white transition-colors">
          {site.email}
        </a>
      </nav>
    </footer>
  );
}
