"use client";

import { AVAILABILITY_LABELS, gradeLabel } from "@takemore/core";

import Link from "next/link";
import { motion } from "framer-motion";
import { priceLabel, rands, savingPercent, type Equipment } from "@/data/equipment";

/**
 * The stock card. Structurally identical to the template's CarCard — same
 * glass panel, same hover behaviour — with rental specs swapped for the three
 * things a buyer of used kitchen kit actually checks: capacity, power draw,
 * and condition grade.
 *
 * `carousel` keeps the template's fixed-width, snap-scrolling behaviour for the
 * highlighted row. `grid` lets the card fill its grid column instead. Only the
 * sizing classes differ — everything inside is shared.
 */
export default function EquipmentCard({
  slug,
  title,
  brand,
  images,
  price,
  retailPrice,
  grade,
  capacity,
  power,
  sold,
  availability = "available",
  availableQuantity,
  variant = "carousel",
  decorative = false,
}: Equipment & { variant?: "carousel" | "grid"; decorative?: boolean }) {
  const image = images[0];
  // Null rather than "Save -20%" when the retail anchor is below our own ask.
  const saving = savingPercent(price, retailPrice);
  // Unbadged stock has an empty brand; " Countertop Oven" with a leading space
  // is what a screen reader and a search result would otherwise get.
  const name = [brand, title].filter(Boolean).join(" ");

  const grid = variant === "grid";
  // Carousel cards are viewport-relative on mobile so several are in play at
  // once while the row drifts, and the card never runs under the screen edge.
  // The mobile max-width has to be lifted again from sm up, or it would also
  // cap the wider desktop card.
  //
  // Grid cards sit two to a row from the narrowest phone up, so below sm the
  // card is only ~160px wide. Everything inside it — insets, type scale, the
  // spec row — is tuned for that column and lifted back to the roomy sizes at
  // sm, where the same two columns are twice as wide.
  const sizing = grid
    ? "w-full h-[250px] sm:h-[400px] xl:h-[440px]"
    : "w-[62vw] max-w-[320px] sm:w-[272px] sm:max-w-none md:w-[400px] h-[304px] sm:h-[352px] md:h-[520px] shrink-0";

  // Carousel labels are sized to their own content and wrap to a second line on
  // the narrowest phones, rather than ellipsising. Static grid cards keep
  // truncation: their columns are tighter, and a clipped label there can't cost
  // anything because the card never moves.
  const specItem = grid
    ? "flex items-center gap-1 min-w-0"
    : "flex items-center gap-1 shrink-0";
  const specText = grid ? "truncate" : "whitespace-nowrap";

  // Two specs are all that fit beside each other in a half-width mobile column,
  // so power draw drops out there and capacity and grade — the two a buyer
  // scans a list by — stay. Power is back from sm up, and on the unit's own
  // page either way.
  const specPower = grid ? `${specItem} hidden sm:flex` : specItem;

  // Carousel cards get no entrance animation of their own: the row they sit in
  // is already moving, and a per-card opacity/scale tween on top of that reads
  // as the card lagging behind its neighbours. Grid cards still fade in.
  const enter = grid
    ? {
        initial: { opacity: 0, scale: 0.95 },
        whileInView: { opacity: 1, scale: 1 },
        viewport: { once: true, margin: "-50px" },
      }
    : {};

  return (
    <motion.div
      data-card="stock"
      {...enter}
      className={`${sizing} relative rounded-[2rem] overflow-hidden group ${
        grid ? "" : "moving-card"
      }`}
    >
      <Link
        href={`/stock/${slug}`}
        aria-label={name}
        className="absolute inset-0 z-20"
        tabIndex={decorative ? -1 : undefined}
        aria-hidden={decorative || undefined}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image}
        alt={name}
        className={`absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out ${
          sold ? "grayscale-[0.6]" : ""
        }`}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent"></div>

      <div
        className={`absolute flex justify-between items-center gap-2 z-10 ${
          grid
            ? "top-3 left-3 right-3 sm:top-4 sm:left-4 sm:right-4"
            : "top-4 left-4 right-4 md:top-6 md:left-6 md:right-6"
        }`}
      >
        {/* Auction stock often arrives unbadged. A brand pill with nothing in
            it is a styled empty chip, so it does not get drawn at all. */}
        {brand && (
          <span
            className={`glass-panel rounded-full font-medium uppercase truncate ${
              grid
                ? "px-2.5 py-1 text-[9px] tracking-wider sm:px-4 sm:py-1.5 sm:text-xs sm:tracking-widest"
                : "px-4 py-1.5 text-xs tracking-widest"
            }`}
          >
            {brand}
          </span>
        )}
        {availability === "available" && !sold && availableQuantity !== undefined && <span className="rounded-full bg-background/90 border border-white/20 px-3 py-1 text-xs text-white">{availableQuantity} available</span>}
        {availability !== "available" ? <span className="rounded-full bg-background/90 border border-white/20 px-3 py-1 text-xs text-white">{AVAILABILITY_LABELS[availability]}</span> : sold ? (
          <span
            className={`rounded-full bg-accent text-background font-medium tracking-widest uppercase shrink-0 ${
              grid
                ? "px-2.5 py-1 text-[9px] sm:px-4 sm:py-1.5 sm:text-xs"
                : "px-4 py-1.5 text-xs"
            }`}
          >
            Sold
          </span>
        ) : (
          /* The arrow only ever appears on hover, so in a half-width mobile
             column it is 28px of dead space stolen from the brand name on a
             device that cannot hover at all. */
          <div
            className={`rounded-full glass-panel items-center justify-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
              grid ? "hidden sm:flex w-7 h-7 sm:w-8 sm:h-8" : "flex w-8 h-8"
            }`}
          >
            <iconify-icon
              icon="solar:arrow-right-up-linear"
              width="16"
              height="16"
              noobserver=""
            ></iconify-icon>
          </div>
        )}
      </div>

      <div
        className={`absolute z-10 flex flex-col ${
          grid
            ? "bottom-2.5 left-2.5 right-2.5 sm:bottom-5 sm:left-5 sm:right-5"
            : "bottom-4 left-4 right-4 md:bottom-6 md:left-6 md:right-6"
        }`}
      >
        <h3
          className={`font-medium tracking-tight ${
            grid
              ? "text-[13px] leading-snug line-clamp-2 mb-2 sm:text-2xl sm:leading-tight sm:mb-3"
              : "text-xl sm:text-2xl md:text-3xl mb-2.5 md:mb-4"
          }`}
        >
          {title}
        </h3>

        <div
          className={`glass-panel panel-solid bg-card/80 rounded-2xl flex flex-col border-none ${
            grid ? "p-2.5 gap-2 sm:p-3.5 sm:gap-2.5" : "p-3 gap-2 md:p-4 md:gap-3"
          }`}
        >
          <div
            className={`flex justify-between items-center gap-2 border-b border-white/5 ${
              grid ? "pb-2 sm:pb-2.5" : "pb-2 md:pb-3"
            }`}
          >
            <div className="flex flex-col min-w-0">
              {/* In a half-width column the "Our price" caption is the first
                  thing to go: the struck retail price above the live one says
                  the same thing in less room. A sold unit keeps its caption —
                  there the wording is the point. */}
              <span
                className={`text-muted font-light whitespace-nowrap ${
                  grid
                    ? `text-[10px] sm:text-xs ${sold ? "" : "hidden sm:block"}`
                    : "text-xs"
                }`}
              >
                {sold ? "Sold for" : "Our price"}
              </span>
              {retailPrice && (
                <span
                  className={`text-muted font-light line-through whitespace-nowrap ${
                    grid ? "text-[9px] sm:text-[11px]" : "text-[11px]"
                  }`}
                >
                  {rands(retailPrice)}
                  {grid ? "" : " new"}
                </span>
              )}
            </div>
            <div className="flex flex-col items-end min-w-0">
              <span
                className={`font-medium tracking-tight whitespace-nowrap ${
                  grid ? "text-[13px] sm:text-base" : "text-base md:text-lg"
                }`}
              >
                {priceLabel(price)}
              </span>
              {saving !== null && (
                <span
                  className={`text-accent font-light whitespace-nowrap ${
                    grid ? "text-[9px] sm:text-[11px]" : "text-[11px]"
                  }`}
                >
                  Save {saving}%
                </span>
              )}
            </div>
          </div>
          <div
            className={`flex justify-between items-center font-light text-white/80 gap-x-1.5 gap-y-1 ${
              grid ? "text-[9px] sm:text-[10px]" : "flex-wrap text-[10px] md:text-xs"
            }`}
          >
            {/* `noobserver` on every icon in this card, and it is load-bearing.
                <iconify-icon> runs an IntersectionObserver of its own and
                *deletes* the rendered <svg> from its shadow root the moment the
                icon leaves the viewport, rebuilding it on the way back in.
                Inside a card drifting through the highlights row that is wrong
                twice over: the host element carries no intrinsic size, so it
                collapses to nothing and this spec row re-flows around it; and
                the rebuild is a DOM mutation inside a card the compositor is
                supposed to be translating untouched, which forces the card to
                be painted again at whatever sub-pixel offset it has reached. */}
            <div className={specItem}>
              <iconify-icon
                icon="solar:widget-linear"
                className="text-muted shrink-0"
                noobserver=""
              ></iconify-icon>
              <span className={specText}>{capacity}</span>
            </div>
            <div className={specPower}>
              <iconify-icon
                icon="solar:bolt-linear"
                className="text-muted shrink-0"
                noobserver=""
              ></iconify-icon>
              <span className={specText}>{power}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <iconify-icon
                icon="solar:verified-check-linear"
                className="text-muted shrink-0"
                noobserver=""
              ></iconify-icon>
              <span className="whitespace-nowrap">{gradeLabel(grade)}</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
