/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  EVERY CLAIM THIS WEBSITE MAKES ABOUT THE REAL WORLD, IN ONE FILE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * This is the file Carlo edits. Nothing else on the site should hardcode a
 * phone number, a statistic, a customer quote or a photograph — it comes from
 * here, and it only reaches a visitor once somebody has said it is true.
 *
 * WHY THIS EXISTS
 * ---------------
 * The mockup shipped with an invented phone number on every CTA, nine invented
 * customer testimonials with real-sounding names and Cape Town suburbs
 * attached, four unchecked statistics, stock photography from Unsplash, and
 * four blog posts whose own header called the rand figures illustrative. Next
 * to all of that, `next.config.mjs` claimed "CI refuses a production deploy
 * that contains any [placeholder media]" — and there was no CI at all.
 *
 * Publishing invented customer quotes is not a content nit. Attributing words
 * to a named person in a named suburb who never said them is a consumer
 * protection and advertising standards problem. So the default here is that
 * nothing is published until it is verified, and the enforcement is mechanical
 * rather than a comment asking somebody to remember.
 *
 * HOW A FACT WORKS
 * ----------------
 * Three independent signals, and it takes all three to publish something:
 *
 *   1. `verified` is an ISO date. null means nobody has checked it.
 *   2. `value` must differ from `placeholder`. `placeholder` freezes the mockup
 *      value, so "unfilled" is detected by comparison with the recorded
 *      original rather than by grepping for magic strings. You cannot set a
 *      date on a fact you have not actually changed.
 *   3. Shape rules the gate applies — a phone number has to parse, a
 *      registration number has to look like a CIPC one, a photograph must not
 *      be hosted on a stock-photo CDN.
 *
 * TWO KINDS OF FACT, AND THE DIFFERENCE MATTERS
 * ---------------------------------------------
 *   BLOCKING (`contact` below). The site cannot honestly function without
 *   these — a storefront with no phone number is broken, not "degraded". So
 *   ONCE `launchState` IS "live", a production build FAILS while any of them is
 *   unverified. See assertProductionReady() at the bottom of this file: it runs
 *   at module load in site.ts, and every page imports site.ts, so there is no
 *   route to a production bundle that skips the check.
 *
 *   While `launchState` is "pre-launch" the same check warns in the build log
 *   and lets the deploy through, so unrelated work is never held hostage to
 *   data only the owner can supply. The placeholders are genuinely public in
 *   that state — sound only until the real domain points at the site.
 *
 *   WITHHELD (everything else). The site is fine without them, so unverified
 *   items simply do not render and the layout closes up. Nothing is deleted —
 *   the mockup copy stays right here, and you publish an item by filling in
 *   its `verified` date. One quote can go live on its own.
 *
 * WHEN YOU ARE READY
 * ------------------
 * Flip `launchState` to "live" at the bottom. Unverified facts stop being
 * warnings and become hard CI failures, so nothing can quietly regress after
 * cutover. Run `npm run check:launch` at any time to see exactly what is left.
 */

export type Fact<T> = {
  /** What the site will publish, once this is verified. */
  value: T;
  /** ISO date somebody checked this against reality. null = nobody has. */
  verified: string | null;
  /** What checking meant. Printed by the launch gate. Be specific. */
  evidence: string;
  /** The mockup value, frozen. Equal to `value` means still unfilled. */
  placeholder?: T;
};

export type LaunchState = "pre-launch" | "live";

export type Testimonial = { name: string; loc: string; text: string };
export type Media = { src: string; alt: string };
export type Stat = { number: string; suffix: string; label: string };
export type Processor = { name: string; purpose: string };
export type PostRecord = { slug: string; image: Media };

/** Hosts that are, by definition, not photographs of this business. */
export const PLACEHOLDER_HOSTS = ["images.unsplash.com", "i.pravatar.cc"] as const;

const unverified = <T,>(value: T, evidence: string): Fact<T> => ({
  value,
  verified: null,
  evidence,
  placeholder: value,
});

// ───────────────────────────────────────────────────────────────────────────
// CONTACT — blocking. A production build fails while any of these is unfilled.
// ───────────────────────────────────────────────────────────────────────────

export const contact = {
  phone: {
    value: "+27 72 659 2547",
    verified: "2026-08-20",
    evidence: "Given by the owner on 2026-08-20 as the number customers should ring.",
    placeholder: "+27 21 555 0134",
  },
  whatsapp: {
    value: "27726592547",
    verified: "2026-08-20",
    evidence:
      "Given by the owner on 2026-08-20. 072 659 2547 in international form, digits only, as wa.me requires.",
    placeholder: "+27215550134",
  },
  email: unverified(
    "sales@takemoreequipment.co.za",
    "Send to it from outside and confirm somebody receives it."
  ),
  address: {
    value: "Unit 4, 19 6th Rd, Montague Gardens, Cape Town, 7441",
    verified: "2026-08-20",
    evidence:
      "Given by the owner on 2026-08-20 as the warehouse address customers drive to.",
    placeholder: "Montague Gardens, Cape Town",
  },
  hours: {
    value: "Monday to Thursday: 09:00–16:00 · Friday: 09:00–15:00 · Saturday: 10:00–13:00",
    verified: "2026-10-08",
    evidence: "Opening hours supplied in the approved website wording.",
  },
  /**
   * The REGISTERED name, which is not the trading name.
   *
   * The site calls itself "Take More Catering Equipment" throughout, and that
   * stays — it is what the business trades as and what customers know. This
   * field is the entity behind it, and it is the one that goes on the © line,
   * on /privacy as the responsible party, and on every invoice. Confusing the
   * two is why this is a separate fact rather than a string in a component.
   */
  legalName: {
    value: "Take More Equipment (Pty) Ltd",
    verified: "2026-08-20",
    evidence:
      "Confirmed by the owner on 2026-08-20 as the registered name. Corroborated by the bank account name on the business's own invoices and by the /07 suffix on the registration number, which denotes a private company.",
    placeholder: "Take More Catering Equipment (Pty) Ltd",
  },
  /**
   * POPIA s18 requires a data subject be told who is responsible for their
   * information, at the point of collection. Every enquiry form on this site
   * links to /privacy, and /privacy has to name these two.
   */
  registrationNumber: {
    value: "2026/328785/07",
    verified: "2026-08-20",
    /**
     * Read off the business's own issued invoice rather than off the CIPC
     * certificate — which is a real document produced by this company and
     * carrying this number to its customers, so it is evidence rather than a
     * guess, but it is one step removed from the register itself. Said plainly
     * here because the placeholder it replaces, 0000/000000/00, was RENDERING
     * on /privacy as this company's registration number, and a false one there
     * is worse than a second-hand true one.
     */
    evidence:
      "Read off invoice INV-0014, issued by the business and supplied by the owner on 2026-08-20. Worth confirming once against the CIPC certificate.",
    placeholder: "0000/000000/00",
  },
  informationOfficer: unverified(
    "Not yet appointed",
    "The person registered with the Information Regulator. By default the head of the business, but it must be a named human being."
  ),
  domain: {
    value: "takemoreequipment.co.za",
    verified: "2026-10-14",
    evidence: "Verified the HTTPS storefront and its production domain aliases.",
  },
} as const;

// ───────────────────────────────────────────────────────────────────────────
// CLAIMS — withheld. Unverified stats do not render; the row closes up.
// ───────────────────────────────────────────────────────────────────────────

export const claims = {
  machinesRebuilt: unverified<Stat>(
    { number: "600", suffix: "+", label: "Machines Rebuilt" },
    "A number you can defend from the workshop records. If you cannot count them, do not publish it."
  ),
  averageSaving: unverified<Stat>(
    { number: "50", suffix: "%", label: "Average Saving vs New" },
    "Take a sample of sold units, compare each to its new-equivalent quote, and average honestly."
  ),
  delivery: unverified<Stat>(
    { number: "48", suffix: "H", label: "Cape Town Delivery" },
    "Must match what /delivery says and what actually happens. A missed delivery promise is a refund claim."
  ),
  /** Rendered as prose in the /about intro and its metadata description. */
  pricedBelowNewRange: unverified(
    "40–60%",
    "The range you can defend across the catalogue, not the best case."
  ),
  /** The 'a new line costs this much' figure the /about problem section leans on. */
  newLineCost: unverified(
    "R380 000",
    "A real quote for a 60-seat line, dated. Prices move; note when you checked."
  ),
} as const;

// ───────────────────────────────────────────────────────────────────────────
// TESTIMONIALS — withheld, and the most legally sensitive thing on the site.
//
// Publish a quote only when: a real customer said it, you can point at where
// (WhatsApp thread, email, Google review), and they are content to be named.
// Under three verified quotes the section renders a proof panel instead, built
// only from things that are already true and checkable — see Testimonials.tsx.
// ───────────────────────────────────────────────────────────────────────────

export const testimonials: Fact<Testimonial>[] = [
  unverified(
    {
      name: "Nadia Petersen",
      loc: "Woodstock",
      text: "We opened with a combi, a range and a double under-counter for what one new combi would have cost. Eighteen months later all three are still running six services a week.",
    },
    "INVENTED FOR THE MOCKUP. Replace with a real quote, or delete this entry."
  ),
  unverified(
    {
      name: "Sipho Ndlovu",
      loc: "Salt River",
      text: "They sent me photos of the replaced element before I paid a cent. No dealer has ever done that for me, new or otherwise.",
    },
    "INVENTED FOR THE MOCKUP. Replace with a real quote, or delete this entry."
  ),
  unverified(
    {
      name: "Marco da Silva",
      loc: "Sea Point",
      text: "Ordered on the Tuesday, delivered and levelled in my kitchen on the Thursday. No drama, no surprise costs at the door.",
    },
    "INVENTED FOR THE MOCKUP. Replace with a real quote, or delete this entry."
  ),
  unverified(
    {
      name: "Aisha Solomon",
      loc: "Observatory",
      text: "The thermostat went at month four. They collected it, fixed it and returned it with nothing to pay. That is the whole reason I would buy from them again.",
    },
    "INVENTED FOR THE MOCKUP. Replace with a real quote, or delete this entry."
  ),
  unverified(
    {
      name: "Johan Brits",
      loc: "Paarden Eiland",
      text: "I run three coffee shops. Every stainless table and under-counter fridge in all three came out of that warehouse.",
    },
    "INVENTED FOR THE MOCKUP. Replace with a real quote, or delete this entry."
  ),
  unverified(
    {
      name: "Thandeka Mokoena",
      loc: "Muizenberg",
      text: "Seeing the actual unit with its actual scratches before driving out there saved me two wasted trips across town.",
    },
    "INVENTED FOR THE MOCKUP. Replace with a real quote, or delete this entry."
  ),
  unverified(
    {
      name: "Riaan Kloppers",
      loc: "Durbanville",
      text: "Graded B, priced like a B, performs like an A. They were straight with me about the dent and knocked it off the price before I asked.",
    },
    "INVENTED FOR THE MOCKUP. Replace with a real quote, or delete this entry."
  ),
  unverified(
    {
      name: "Fatima Adams",
      loc: "Athlone",
      text: "I sent a photo of the gap in my line on a Saturday. By Monday they had two options with prices and dimensions in my inbox.",
    },
    "INVENTED FOR THE MOCKUP. Replace with a real quote, or delete this entry."
  ),
  unverified(
    {
      name: "Grant Michaels",
      loc: "Somerset West",
      text: "Fitting out a second site from new would have taken my whole budget. We did it for under half and kept cash for staff.",
    },
    "INVENTED FOR THE MOCKUP. Replace with a real quote, or delete this entry."
  ),
];

// ───────────────────────────────────────────────────────────────────────────
// MEDIA — withheld. This file is the ONLY place a stock-photo URL may appear;
// the launch gate fails the build if one turns up anywhere else in apps/web.
//
// Real photography goes in the `item-media` Storage bucket under a `site/`
// prefix and is referenced by its public URL, exactly like item photography.
// ───────────────────────────────────────────────────────────────────────────

const stock = (id: string) =>
  `https://images.unsplash.com/${id}?q=80&w=1200&auto=format&fit=crop`;

export const media = {
  hero: unverified<Media>(
    {
      src: "https://images.unsplash.com/photo-1708915965975-2a950db0e215?q=80&w=2938&auto=format&fit=crop",
      alt: "Refurbished commercial kitchen line",
    },
    "A photograph of your own workshop or a line you fitted. Landscape, at least 2000px wide."
  ),
  aboutWorkshop: unverified<Media>(
    {
      src: stock("photo-1589109807644-924edf14ee09"),
      alt: "Stainless wash-up line in the workshop",
    },
    "The actual wash-up line the caption describes. 4:3 works best."
  ),
} as const;

// ───────────────────────────────────────────────────────────────────────────
// JOURNAL — withheld. The prose lives in posts.ts; what needs checking is the
// figures inside it and the photograph on top of it, so that is what is
// recorded here. A post renders only if its slug appears below and is verified.
//
// posts.ts flagged itself: "figures are illustrative and should be checked
// before publishing". These posts quote hard rand figures — R42 500 against
// R98 000, "a saving of R215 350, or 56%" — presented as fact to somebody
// deciding how to spend their money. Check them or do not publish them.
// ───────────────────────────────────────────────────────────────────────────

export const posts: Fact<PostRecord>[] = [
  unverified<PostRecord>(
    {
      slug: "what-a-second-hand-combi-oven-should-cost",
      image: {
        src: stock("photo-1707255280298-e540809f4c01"),
        alt: "Combi oven in the workshop",
      },
    },
    "Check the new-price range and every used figure against current quotes, then photograph one of your own combis."
  ),
  unverified<PostRecord>(
    {
      slug: "nine-checks-before-you-buy-used-equipment",
      image: {
        src: stock("photo-1588416820614-f8d6ac6cea56"),
        alt: "Workshop bench with parts laid out",
      },
    },
    "The advice is yours and sound; confirm the nine checks match what your workshop actually does, then use your own photograph."
  ),
  unverified<PostRecord>(
    {
      slug: "grade-a-b-c-what-the-letters-mean",
      image: {
        src: stock("photo-1696475091592-cd1cab5afdc2"),
        alt: "Graded units on the floor",
      },
    },
    "Must agree exactly with /conditions and with the grades in ops. This one is a promise, not an opinion."
  ),
  unverified<PostRecord>(
    {
      slug: "fitting-out-a-60-seat-kitchen",
      image: {
        src: stock("photo-1708915965975-2a950db0e215"),
        alt: "A fitted-out commercial kitchen line",
      },
    },
    "Every rand figure in the worked example needs checking against real sales. This is the post most likely to be quoted back at you."
  ),
];

// ───────────────────────────────────────────────────────────────────────────
// SUB-PROCESSORS — rendered by /privacy. POPIA requires you say who else
// touches a customer's information, so adding a vendor anywhere in this
// codebase means adding it here, which mechanically changes the notice.
// ───────────────────────────────────────────────────────────────────────────

export const processors: Fact<Processor>[] = [
  {
    value: { name: "Supabase", purpose: "hosts our database" },
    verified: "2026-08-08",
    evidence: "The database this platform runs on. Named in the notice since it was written.",
  },
  {
    value: { name: "Resend", purpose: "sends our email" },
    verified: "2026-08-08",
    evidence: "Marketing and transactional email. Named in the notice since it was written.",
  },
  {
    value: { name: "Vercel", purpose: "hosts this website" },
    verified: "2026-08-08",
    evidence: "Serves every page and therefore handles request data including IP addresses.",
  },
  {
    value: { name: "Cloudflare", purpose: "checks our forms are not being filled in by bots" },
    verified: "2026-08-08",
    evidence: "Turnstile. Sees a token and an IP address at the moment a form is submitted.",
  },
  {
    value: { name: "Sentry", purpose: "tells us when something breaks" },
    verified: "2026-08-08",
    evidence:
      "Error monitoring. Configured with sendDefaultPii false and a beforeSend that strips names, emails and phone numbers before anything leaves.",
  },
];

// ───────────────────────────────────────────────────────────────────────────
// SECURITY posture that has to be true before this is a public website.
// ───────────────────────────────────────────────────────────────────────────

export const security = {
  turnstile: unverified(
    false,
    "Set NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY on both Vercel projects, submit the enquiry form on the deployed site, then set this to true. Without it, production refuses every form submission by design."
  ),
} as const;

// ═══════════════════════════════════════════════════════════════════════════
//  ▼▼▼  FLIP THIS WHEN THE DOMAIN IS ABOUT TO BE POINTED HERE.  ▼▼▼
//
//  "pre-launch" — unverified facts are warnings. You can build and deploy.
//  "live"       — unverified facts fail the build. Nothing can regress.
// ═══════════════════════════════════════════════════════════════════════════

export const launchState: LaunchState = "pre-launch";

// ───────────────────────────────────────────────────────────────────────────
// Helpers. Used by the site to decide what renders, and by
// scripts/check-launch-ready.mjs to decide what fails.
// ───────────────────────────────────────────────────────────────────────────

const sameAsPlaceholder = <T,>(fact: Fact<T>): boolean =>
  fact.placeholder !== undefined &&
  JSON.stringify(fact.value) === JSON.stringify(fact.placeholder);

/**
 * May this be published?
 *
 * Both conditions, always. Checking `verified` alone would let somebody set a
 * date on a fact they never actually edited — which is the exact failure this
 * whole file exists to prevent, so the runtime enforces it too rather than
 * trusting the CI check to have run.
 */
export const isVerified = <T,>(fact: Fact<T>): boolean =>
  fact.verified !== null && !sameAsPlaceholder(fact);

/** The verified ones, in order. */
export const published = <T,>(facts: Fact<T>[]): T[] =>
  facts.filter(isVerified).map((fact) => fact.value);

/** A verified value, or null if it is being withheld. */
export const publishedValue = <T,>(fact: Fact<T>): T | null =>
  isVerified(fact) ? fact.value : null;

/** Does this URL point at a stock-photo CDN rather than at this business? */
export const isPlaceholderMedia = (src: string): boolean =>
  PLACEHOLDER_HOSTS.some((host) => src.includes(host));

/**
 * Is there a Journal to link to?
 *
 * Derived here rather than from posts.ts so the navigation — which lives in
 * client components — can ask the question without pulling every post's prose
 * into the browser bundle to answer it.
 */
export const hasJournal = posts.some(isVerified);

/** Blocking facts, by name, in the order somebody should fill them in. */
export const BLOCKING: Array<[string, Fact<unknown>]> = Object.entries(contact) as Array<
  [string, Fact<unknown>]
>;

/**
 * The gate, and the one thing it must not do: block work it was never meant to.
 *
 * Called at module load from site.ts, which every page imports, so there is no
 * route to a production bundle that has not passed through here.
 *
 * WHAT IT KEYS OFF, and why this took a frozen site to notice: `launchState`.
 * The banner at that constant states the contract plainly — "pre-launch" makes
 * unverified facts warnings you can build and deploy past, "live" makes them
 * fail the build. This function used to throw in production regardless, which
 * is not a stricter reading of that contract, it is a different one.
 *
 * The cost was not theoretical. Production could not build from 2026-08-08
 * onward, so a carousel fix, a delete button and a stock-photo fix all sat
 * undeployed behind nine contact details only the owner can supply — none of
 * which those changes touched. A gate that stops unrelated work is a gate that
 * gets torn out in frustration, which would have cost the real guarantee too.
 *
 * So it now honours the switch, and the switch keeps its promise:
 *
 *   · pre-launch — warns in the build log, loudly, and builds. The placeholder
 *     phone, address and registration number ARE published in this state. That
 *     is the trade, and it is sound only while no customer traffic reaches the
 *     deployment — as of 2026-08-11 the real domain does not point here.
 *   · live — refuses, exactly as before, so nothing can regress after cutover.
 *
 * Flip it in the banner above before the domain is pointed at this site.
 */
export function assertProductionReady(): void {
  if (process.env.VERCEL_ENV !== "production") return;

  const missing = BLOCKING.filter(([, fact]) => !isVerified(fact)).map(([name]) => name);
  if (missing.length === 0) return;

  const live = launchState === "live";

  const report = [
    "",
    "  ┌───────────────────────────────────────────────────────────────────┐",
    live
      ? "  │  PRODUCTION BUILD REFUSED                                         │"
      : "  │  PLACEHOLDER CONTACT DETAILS ARE ABOUT TO GO PUBLIC               │",
    "  └───────────────────────────────────────────────────────────────────┘",
    "",
    `  ${missing.length} contact detail${missing.length === 1 ? " is" : "s are"} still the mockup placeholder:`,
    "",
    ...missing.map((name) => `      · ${name}`),
    "",
    "  These appear on every CTA, in the footer, and in the POPIA privacy",
    "  notice. Publishing an invented number is worse than publishing none.",
    "",
    "  Fix them in  apps/web/src/data/launch.ts  — set the real value and",
    "  put today's date in `verified`.",
    "",
    "  Run  npm run check:launch  to see everything else that is waiting.",
    "",
    live
      ? ""
      : '  Building anyway: launchState is "pre-launch". Flip it to "live"\n  before the domain points here, and this becomes a refusal again.\n',
  ].join("\n");

  if (live) throw new Error(report);
  console.warn(report);
}
