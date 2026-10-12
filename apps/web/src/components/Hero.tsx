"use client";

import Image from "next/image";
import { useSegment } from "./SegmentProvider";
import { motion } from "framer-motion";
import Navbar from "./Navbar";
import Subheading from "./Subheading";
import { site, whatsappLink } from "@/data/site";

// Hero Component
export default function Hero() {
  const { segment } = useSegment();
  const home = segment === "homestaging";
  return (
    // On a phone the framed image was 85vh with the title pinned to its floor,
    // which left a screenful of empty photo between the city line and the
    // headline. Shorter image, same composition, far less dead space. Desktop
    // keeps its full 90vh.
    //
    // No padding under the frame, and no radius on its bottom two corners:
    // the hero's floor is not an edge any more, it is a dissolve into the page
    // (see the fade overlay below). A gutter and a curve there would both be
    // invisible — everything is #080805 by then — but only as long as nothing
    // downstream disagrees by a shade, so the honest thing is to have no edge
    // rather than a hidden one. The two min-heights below each grow by the
    // padding removed here, so the hero occupies exactly the band it did.
    <div className="relative p-2 pb-0 md:p-4 md:pb-0">
      {/* A *minimum* height, not a fixed one — that is the whole fix.

          The two text blocks below used to be pinned to opposite ends of this
          frame with `absolute top-32` and `absolute bottom-0`. Their heights
          come from the words in them; the frame's height came from the
          viewport; and nothing whatsoever related the two. So on any screen
          short enough that 90vh was less than city-line + headline + strapline,
          they simply printed over each other — the headline through the "Cape
          Town" and "Rebuilt in our workshop" lines. It needed no unusual
          screen: a 390×844 phone already overlapped by 2px, a 360×640 one by
          7px, and the framed preview on the Website tab of the ops app — a
          wide, short box — by 32px.

          Now the same three blocks are laid out in flow, in a column, with a
          growing gap between them, so the frame can never be shorter than what
          it holds: the gap absorbs the slack when there is room to spare, and
          the frame grows when there is not. The minimum reproduces the old
          fixed height exactly (less the padding above, which used to be inside
          the old measurement), so on any screen that already fitted, nothing
          moves by a pixel.

          Both terms of each minimum carry the half of that padding the wrapper
          no longer spends below the frame — 474→482 and 58vh-1rem→58vh-0.5rem
          on a phone, 488→504 and 90vh-2rem→90vh-1rem from md. Frame plus
          padding therefore still measures max(490px, 58vh) and max(520px,
          90vh), exactly as before; the hero simply owns the last 8/16px of it
          instead of leaving them empty. */}
      <div
        className="relative w-full rounded-[2rem] rounded-b-none overflow-hidden flex flex-col
                   min-h-[max(482px,calc(58vh-0.5rem))] md:min-h-[max(504px,calc(90vh-1rem))]"
      >
        <Image
          src={home ? "/images/homestaging-hero.webp" : "/images/industrial-kitchen-hero.webp"}
          alt={home ? "A warm living room styled with wood furniture and natural textures" : "An industrial kitchen with orderly stainless steel workstations and extraction canopies"}
          fill sizes="100vw" priority unoptimized className="object-cover scale-105"
        />
        {/* Scrim is heavier than the source template's — that hero used an already-dark
            studio car shot, whereas kitchen interiors are lit and busy. It is also
            what lets the hero survive having no photograph at all: over a flat card
            colour this same gradient reads as an intentional dark hero. */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/70 via-background/50 to-background/95"></div>

        {/* The floor of the hero, dissolved into the page.
            The scrim above ends at 95% — dark, but still 5% of a lit kitchen
            against a page that is flat #080805, and that last 5% was the visible
            cut. This takes the bottom band the rest of the way to opaque, so the
            photograph runs out before the frame does and there is nothing left to
            see an edge of.

            Vertical only, as asked: full-bleed left to right, so the side edges
            of the frame keep their crop and simply darken out of sight along with
            everything else near the floor.

            The stops are smoothstep (3t²−2t³) sampled every 10%, not a plain
            two-stop ramp. A linear fade has a corner in it at both ends — the eye
            reads the sudden onset of darkening as a horizontal line across the
            photo, and the arrival at black as a second one. Smoothstep is flat at
            both, so the fade has no beginning and no end you can point at, which
            is the whole job. Written as explicit rgba rather than `transparent`
            so the ramp interpolates within the background colour and never dips
            through a different one.

            Proportional, so a tall desktop hero fades over a distance that suits
            it, with a floor for short frames and a ceiling so a very tall one
            does not surrender half the photograph to the gradient. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[42%] min-h-[200px] max-h-[480px]"
          style={{
            backgroundImage:
              "linear-gradient(to bottom," +
              "rgb(var(--site-background) / 0 ) 0%," +
              "rgb(var(--site-background) / 0.028) 10%," +
              "rgb(var(--site-background) / 0.104) 20%," +
              "rgb(var(--site-background) / 0.216) 30%," +
              "rgb(var(--site-background) / 0.352) 40%," +
              "rgb(var(--site-background) / 0.5) 50%," +
              "rgb(var(--site-background) / 0.648) 60%," +
              "rgb(var(--site-background) / 0.784) 70%," +
              "rgb(var(--site-background) / 0.896) 80%," +
              "rgb(var(--site-background) / 0.972) 90%," +
              "rgb(var(--site-background) / 1) 100%)",
          }}
        ></div>

        {/* Deliberately uncapped, same as the headline row below it — capping
            this at max-w-[1440px] would agree with the navbar but disagree
            with the headline, since that row is plain padding too. See
            headerRow() in headerLayout.ts: the overlay navbar is the one
            that stays uncapped past 1440px, to agree with this.

            The old `top-20 md:top-32` is now the same distance expressed as
            padding, so the row starts where it always did. It takes two
            elements rather than one: the padding is on this wrapper, and the
            flex row inside is the bare, unpadded positioning root the centered
            block is placed against. An absolutely positioned child measures
            from its container's *padding* box, so a single padded element
            would put that block's `top-0` above the padding it is meant to sit
            below — level with the top of the photo.

            `z-10` without `relative` is deliberate: this is a flex item, and
            z-index applies to flex items whatever their position. Adding
            `relative` would make this the centered block's containing block,
            which is exactly the mistake described above. */}
        <div className="shrink-0 z-10 pt-20 md:pt-32 px-5 sm:px-6 md:px-12">
          <div className="relative flex justify-between items-start text-xs font-light text-white/70">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
              {site.city}, {site.country}
            </motion.div>
            {/* Right-aligned text stacks unevenly when the lines are different
                lengths — the shorter line's left edge trails the longer one's,
                reading as a staggered cascade rather than a block. text-center
                fixes that on its own. Position is a separate problem: as the
                middle child of a 3-item justify-between row this only ever
                landed wherever the "Cape Town" text and the third block's
                widths left it, not at the row's actual center — same fix as
                the navbar pill above, taken out of flex flow and centered
                against the row itself. */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="hidden md:block absolute left-1/2 top-0 -translate-x-1/2 text-center max-w-[200px]"
            >
              {home ? "Furniture with character." : "Quality equipment."}
              <br />
              {home ? "Find your next great piece." : "Great prices."}
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="text-center max-w-[250px] hidden lg:block"
            >
              {home ? "Furniture, decor and unexpected finds for your home or your next staging project." : "Browse online, then visit our warehouse to see the equipment and speak to our team."}
            </motion.div>
          </div>
        </div>

        {/* The slack. It takes every pixel the two text blocks do not, which is
            what keeps the headline on the floor of a tall hero exactly as
            `bottom-0` used to; and it stops shrinking at a small gap, which is
            what keeps the headline off the city line on a short one. Past that
            point the frame above grows instead of the two blocks meeting. */}
        <div className="grow min-h-[1.5rem] md:min-h-[2.5rem]" />

        {/* Two columns from xl, not lg — the headline's own line breaks are the
            reason.

            It is written as two lines, with a hard <br/> after "Kit,". Putting
            the Instagram/WhatsApp column beside it costs this one roughly
            330px plus the lg:pl-12 gutter, which took the headline's box from
            652px down to 531px — narrower than "Restaurant-Grade Equipment." needs
            at text-7xl. So the line broke again on its own, and between the lg
            breakpoint and about 1180px the headline silently rendered as three
            lines, or four from 1024–1080px, before snapping back to two on a
            wider screen. A ~150px-wide band of laptop widths, and squarely
            where the framed preview on the ops app's Website tab sits.

            Splitting at xl instead means the columns only divide once both
            halves fit at full size; below that the CTAs use the same stacked
            form they already use on a tablet. The alternative — stepping the
            headline down a size for the band — would have to drop it two
            steps, to text-5xl, to fit 531px, and a 72→48→72px jump across
            150px of width is more conspicuous than the stack. */}
        <div className="shrink-0 p-5 sm:p-6 md:p-12 z-20 flex flex-col xl:flex-row justify-between xl:items-end gap-5 md:gap-8">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="max-w-2xl"
          >
            <Subheading text={home ? "Furniture & Home Finds · Cape Town" : "Commercial Catering Equipment · Cape Town"} />
            <h1 className="text-4xl sm:text-5xl md:text-7xl font-medium tracking-tighter leading-[1.1] mb-4 md:mb-5">
              {home ? "Great Pieces." : "Restaurant-Grade Equipment."}
              <br />
              {home ? "Unexpected Prices." : "Half The Retail Price"}
            </h1>
            <p className="text-sm md:text-base font-light text-white/70 leading-relaxed max-w-lg mb-1">
              {home ? "Furniture and home finds with character. Browse the collection, then visit our warehouse to find the piece that feels right." : "Inspected, repaired and tested catering equipment. Browse online, then see it in person at our Montague Gardens warehouse."}
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-4 sm:gap-6 border-t xl:border-t-0 xl:border-l border-white/10 pt-5 md:pt-6 xl:pt-0 xl:pl-8 w-full xl:w-auto"
          >
            {/* Social brand marks come from mdi because Solar has no equivalent. */}
            <a
              href="https://www.instagram.com/takemoreequipment/"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center space-x-3 text-lg font-light hover:text-accent transition-colors w-full sm:w-auto justify-between"
            >
              <span>Instagram</span>
              <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center group-hover:border-accent transition-colors">
                <iconify-icon icon="mdi:instagram" width="16" height="16"></iconify-icon>
              </div>
            </a>
            <a
              href={site.facebook}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center space-x-3 text-lg font-light hover:text-accent transition-colors w-full sm:w-auto justify-between"
            >
              <span>Facebook</span>
              <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center group-hover:border-accent transition-colors">
                <iconify-icon icon="mdi:facebook" width="16" height="16"></iconify-icon>
              </div>
            </a>
            <a
              href={whatsappLink(home ? "Hi Take More, I'm looking for furniture and home finds." : "Hi Take More, I'm looking for equipment for my kitchen.")}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center space-x-3 text-lg font-light hover:text-accent transition-colors w-full sm:w-auto justify-between"
            >
              <span>WhatsApp Us</span>
              <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center group-hover:border-accent transition-colors">
                <iconify-icon icon="solar:arrow-right-linear" width="16" height="16"></iconify-icon>
              </div>
            </a>
          </motion.div>
        </div>
      </div>

      {/* Outside the framed image, not inside it: an absolute box is positioned
          against its ancestor's padding box, so out here the navbar's own
          padding is measured from the viewport edge — the same edge the menu
          overlay measures from. Inside the frame it was offset by the frame's
          own padding, and the logo slid by that much every time the menu
          opened. It still paints over the image; only its ruler changed. */}
      <Navbar />
    </div>
  );
}
