"use client";

import { motion } from "framer-motion";
import Subheading from "./Subheading";
import EnquiryForm from "./EnquiryForm";
import { site, whatsappLink } from "@/data/site";
import type { CategoryChoice } from "@/data/equipment";

// Closing CTA — Phase 1 sells by enquiry, so this is the primary conversion point.
export default function CtaBand({
  categories = [],
  formEnabled = true,
  homestaging = false,
}: {
  categories?: CategoryChoice[];
  homestaging?: boolean;
  /** From `enquiryFormEnabled()` on the server — see EnquiryForm. */
  formEnabled?: boolean;
}) {
  return (
    <section className="py-12 md:py-14 md:py-24 px-6 md:px-12 w-full max-w-[1440px] mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-100px" }}
        className="relative bg-card rounded-[2rem] border border-border p-6 sm:p-8 md:p-16 overflow-hidden"
      >
        <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/3 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[100px] pointer-events-none"></div>

        <div className="relative grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 lg:items-center">
          <div className="max-w-2xl">
            <Subheading text="Looking For Something Specific?" />
            <h2 className="text-2xl sm:text-3xl lg:text-5xl font-medium tracking-tight leading-tight mb-6">
              {homestaging ? "Looking for the piece that finishes your room?" : "Looking for something specific?"}
            </h2>
            <p className="text-muted font-light text-sm leading-relaxed max-w-lg mb-8">
              {homestaging ? "Tell us about the furniture or home item you’re looking for, your space and your budget. If we don’t have it in stock, we’ll keep an eye out and let you know when something suitable becomes available." : "Tell us what equipment you’re looking for and your budget. If we don’t have it in stock, we’ll look for it and let you know when it becomes available, with photos and prices."}
            </p>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 shrink-0">
            <a
              href={whatsappLink(
                homestaging ? "Hi Take More, I'm looking for furniture and home finds:" : "Hi Take More, I'm looking for the following equipment:"
              )}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-4 group"
            >
              <span className="text-lg font-light group-hover:text-accent transition-colors">
                WhatsApp Us
              </span>
              <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center text-background group-hover:scale-105 transition-transform">
                <iconify-icon icon="solar:chat-round-line-linear" width="20" height="20"></iconify-icon>
              </div>
            </a>
            <div className="hidden sm:block w-[1px] h-8 bg-white/10"></div>
            <a
              href={`tel:${site.phone.replace(/\s/g, "")}`}
              className="inline-flex items-center space-x-4 group"
            >
              <span className="text-lg font-light group-hover:text-accent transition-colors">
                {site.phone}
              </span>
              <div className="w-10 h-10 rounded-xl bg-background border border-border flex items-center justify-center text-accent group-hover:scale-105 transition-transform">
                <iconify-icon icon="solar:phone-linear" width="20" height="20"></iconify-icon>
              </div>
            </a>
            </div>
          </div>

          {/*
            The general capture. This band already carried the copy for it —
            "tell us the machine and the number you have to hit" — and until now
            the only way to answer was to start a WhatsApp conversation, which
            is a much bigger ask than typing an email address.
          */}
          <EnquiryForm
            mode="general"
            categories={categories}
            className="bg-background"
            enabled={formEnabled}
          />
        </div>
      </motion.div>
    </section>
  );
}
