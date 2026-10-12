"use client";

import { motion } from "framer-motion";
import Subheading from "./Subheading";

// Process Section — the story that justifies the price.
export default function Process() {
  const steps = [
    {
      icon: "solar:settings-linear",
      title: "We inspect and repair",
      copy: "Our second-hand catering equipment is inspected and repaired before being listed for sale.",
    },
    {
      icon: "solar:checklist-minimalistic-linear",
      title: "Know what to expect",
      copy: "We photograph each item, describe it and clearly state its condition, so you know what you are coming to see.",
    },
    {
      icon: "solar:delivery-linear",
      title: "View and choose",
      copy: "Visit our Montague Gardens warehouse to see the equipment and choose what suits your kitchen. Collect your purchase or let us arrange delivery, quoted separately.",
    },
  ];

  return (
    <section
      id="process"
      className="py-14 md:py-24 px-6 md:px-12 w-full max-w-[1440px] mx-auto relative scroll-mt-24 overflow-hidden"
    >
      {/* Inherited from the "Why Take More" section that used to sit below this
          one: it was the only accent glow between the catalogue and the footer,
          and without it everything from here down reads as flat black. It suits
          this section better anyway — this is where the argument is made.

          Two things it must keep. `overflow-hidden` on the section above, and
          the 120vw clamp: at a fixed 600px the blur is wider than a phone and
          widens the document, which pushed every section below the right edge.
          Nothing here is a scroll container and nothing is sticky, so clipping
          costs the section nothing. */}
      <div
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(600px,120vw)] h-[600px] bg-accent/5 rounded-full blur-[100px] -z-10"
      ></div>

      <div className="text-center mb-10 md:mb-16 flex flex-col items-center">
        <Subheading text="How It Works" />
        <h2 className="text-2xl sm:text-3xl lg:text-5xl font-medium tracking-tight max-w-3xl leading-tight">
          Restaurant-Grade Equipment. Half The Retail Price.
        </h2>
        {/* The three-way frame: the two alternatives a buyer is actually weighing,
            and why the third one is the only one that gives them both halves. */}
        <p className="text-muted font-light text-sm leading-relaxed max-w-2xl mt-5 md:mt-6">
          Browse online. Explore the warehouse. See the equipment, talk to our team and choose what works for your kitchen.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {steps.map((step, idx) => (
          <motion.div
            key={step.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: idx * 0.1 }}
            className="border-t border-border pt-8 flex flex-col"
          >
            <div className="flex items-center justify-between mb-8">
              <span className="text-4xl sm:text-5xl font-light tracking-tighter text-white/15">
                0{idx + 1}
              </span>
              <div className="w-12 h-12 rounded-2xl bg-card border border-border flex items-center justify-center text-accent">
                <iconify-icon icon={step.icon} width="22" height="22"></iconify-icon>
              </div>
            </div>
            <h3 className="text-xl font-medium tracking-tight mb-3">{step.title}</h3>
            <p className="text-muted font-light text-sm leading-relaxed">{step.copy}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
