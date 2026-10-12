"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { Turnstile } from "@takemore/ui";
import { submitEnquiry, type EnquiryResult } from "@/app/actions/enquiry";
import { site, whatsappLink } from "@/data/site";
import type { CategoryChoice } from "@/data/equipment";

/**
 * The form that keeps the enquiry.
 *
 * Every conversion point on this site is a wa.me link, which composes exactly
 * what a visitor wants into a message string and then forgets it. This sits
 * beside those links rather than replacing them — some people will always rather
 * just chat, and the WhatsApp button converts a ready buyer faster than any form
 * ever will.
 *
 * What it is actually for is the OTHER visitor: the one who is not ready today,
 * who would not start a chat, and who leaves without a trace. That person is the
 * majority of this page's traffic, and asking them for one field is the
 * difference between knowing they exist and not.
 *
 * Hence: EMAIL IS THE ONLY REQUIRED FIELD. Name and phone are offered, visible,
 * and optional. Staff fill the rest in when they speak to them.
 */

type Mode = "product" | "sold" | "general";

const CONTROL =
  "w-full bg-background border border-border rounded-xl px-4 py-3 text-sm font-light " +
  "text-white/90 placeholder:text-muted/70 hover:border-white/20 " +
  "focus:border-accent focus:outline-none transition-colors";

const COPY: Record<Mode, { eyebrow: string; heading: string; blurb: string; cta: string }> = {
  product: {
    eyebrow: "Want one like this?",
    heading: "Tell us, and we will watch for the next one",
    blurb:
      "Leave your details and tell us what you’re looking for. We’ll let you know when a suitable item becomes available.",
    cta: "Keep me posted",
  },
  sold: {
    eyebrow: "This one has sold",
    heading: "We can find you another",
    blurb:
      "Machines like this come through most months. Leave your email and you will hear about the next one before it reaches this page.",
    cta: "Find me one",
  },
  general: {
    eyebrow: "Looking for something specific?",
    heading: "Tell us what you need",
    blurb: "WhatsApp or call us with the details of what you’re looking for.",
    cta: "Send it through",
  },
};

export default function EnquiryForm({
  mode = "general",
  itemSlug,
  itemTitle,
  categories = [],
  className = "",
  enabled = true,
}: {
  mode?: Mode;
  itemSlug?: string;
  itemTitle?: string;
  /** Offered as chips on the general form. Ignored on a product page, where the
   *  category is resolved from the item itself. */
  categories?: CategoryChoice[];
  className?: string;
  /**
   * Decided on the server by `enquiryFormEnabled()` in src/lib/forms.ts. False
   * means the server action would refuse every submission (production with
   * Turnstile unconfigured), so the WhatsApp and phone fallback renders INSTEAD
   * of a form the visitor would fill in and then be turned away from.
   */
  enabled?: boolean;
}) {
  const [state, action] = useActionState<EnquiryResult | null, FormData>(
    submitEnquiry,
    null
  );
  const [category, setCategory] = useState("");

  // One unlabelled group while the shop sells a single line, so the form looks
  // exactly as it did; a labelled group per line once it sells two.
  const chipGroups: { label: string | null; categories: CategoryChoice[] }[] = (() => {
    const lines: string[] = [];
    for (const option of categories)
      if (!lines.includes(option.division)) lines.push(option.division);
    if (lines.length < 2) return [{ label: null, categories: [...categories] }];
    return lines.map((line) => ({
      label: line,
      categories: categories.filter((option) => option.division === line),
    }));
  })();
  const id = useId();
  const copy = COPY[mode];
  const onProduct = mode === "product" || mode === "sold";

  /**
   * Bumped every time the form comes back with an error, to make the Turnstile
   * widget mint a fresh token.
   *
   * A Turnstile token is single-use, and this form stays mounted after a
   * failure. Without a reset the retry replays a spent token and fails again —
   * permanently, from the person's point of view, for a reason they could do
   * nothing about. Which is a far worse failure than the one it protects
   * against.
   */
  const [attempts, setAttempts] = useState(0);
  useEffect(() => {
    if (state && !state.ok) setAttempts((n) => n + 1);
  }, [state]);

  if (!enabled) {
    const message =
      itemTitle && onProduct
        ? `Hi Take More, I'm asking about the ${itemTitle}:`
        : "Hi Take More, I'm looking for the following equipment:";
    return (
      <div className={`bg-card border border-border rounded-[2rem] p-6 sm:p-8 ${className}`}>
        <div className="flex items-center space-x-3 mb-3">
          <div className="w-5 h-1 rounded-full bg-accent" />
          <span className="text-accent uppercase text-xs tracking-wider font-normal">
            {copy.eyebrow}
          </span>
        </div>
        <h3 className="text-xl sm:text-2xl font-medium tracking-tight mb-3">{copy.heading}</h3>
        <p className="text-sm font-light text-muted leading-relaxed mb-6">
          Our enquiry form is temporarily unavailable. Please WhatsApp or call us instead.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <a
            href={whatsappLink(message)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-between gap-3 bg-accent text-background rounded-2xl px-6 py-4 hover:opacity-90 transition-opacity"
          >
            <span className="text-sm font-medium">WhatsApp us</span>
            <iconify-icon icon="solar:chat-round-line-linear" width="18" height="18"></iconify-icon>
          </a>
          <a
            href={`tel:${site.phone.replace(/\s/g, "")}`}
            className="flex-1 flex items-center justify-between gap-3 border border-border rounded-2xl px-6 py-4 hover:border-white/25 transition-colors"
          >
            <span className="text-sm font-light">{site.phone}</span>
            <iconify-icon
              icon="solar:phone-linear"
              width="18"
              height="18"
              className="text-accent"
            ></iconify-icon>
          </a>
        </div>
      </div>
    );
  }

  if (state?.ok) {
    return (
      <div
        className={`bg-card border border-accent/30 rounded-[2rem] p-6 sm:p-8 flex items-start gap-4 ${className}`}
      >
        <span className="w-10 h-10 shrink-0 rounded-2xl bg-accent/10 border border-accent/30 flex items-center justify-center text-accent">
          <iconify-icon icon="solar:check-read-linear" width="18" height="18"></iconify-icon>
        </span>
        <div>
          <h3 className="text-base font-medium tracking-tight mb-1">{state.message}</h3>
          <p className="text-xs font-light text-muted leading-relaxed">
            If it is urgent, WhatsApp us on {site.phone} — we always answer that faster.
          </p>
        </div>
      </div>
    );
  }

  return (
    /* `relative` so the off-screen honeypot below is positioned against this
       form rather than against the page, which would give the page a
       horizontal scrollbar on mobile. */
    <form
      action={action}
      className={`relative bg-card border border-border rounded-[2rem] p-6 sm:p-8 ${className}`}
    >
      <div className="flex items-center space-x-3 mb-3">
        <div className="w-5 h-1 rounded-full bg-accent" />
        <span className="text-accent uppercase text-xs tracking-wider font-normal">
          {copy.eyebrow}
        </span>
      </div>

      <h3 className="text-xl sm:text-2xl font-medium tracking-tight mb-3">{copy.heading}</h3>
      <p className="text-sm font-light text-muted leading-relaxed mb-6">{copy.blurb}</p>

      {/* Context the visitor never types. The slug is resolved server-side
          against published stock, so this is a hint, not a trusted input. */}
      {itemSlug && <input type="hidden" name="itemSlug" value={itemSlug} />}
      <input type="hidden" name="categorySlug" value={onProduct ? "" : category} />
      <input type="hidden" name="fromProduct" value={onProduct ? "1" : "0"} />

      {/* The honeypot. Off-screen rather than display:none — some bots skip
          fields they cannot render — and hidden from assistive technology so no
          real person is ever asked to fill it in. */}
      <div className="absolute left-[-9999px] top-auto w-px h-px overflow-hidden" aria-hidden="true">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {/* One tap that turns a sentence of free text into something the stock
          matcher can actually join on. A category match scores thirty; the same
          words as loose text score eight. Optional, and tapping it again clears
          it — a chip you cannot un-pick is a chip people avoid. */}
      {!onProduct && categories.length > 0 && (
        <fieldset className="mb-4">
          <legend className="text-xs font-light text-muted mb-2">
            What kind of thing? <span className="text-muted/60">(optional)</span>
          </legend>
          {/* Split by line of business once the shop sells more than one, so
              twelve chips read as two short lists rather than one long one.
              Unlike the catalogue, nothing here is dropped for being out of
              stock — the whole point of the form is asking for what we do not
              currently have on the floor. */}
          {chipGroups.map((group) => (
            <div key={group.label ?? "all"} className="mb-3 last:mb-0">
              {group.label && (
                <span className="block text-[11px] font-light text-muted/70 mb-1.5">
                  {group.label}
                </span>
              )}
              <div className="flex flex-wrap gap-2">
                {group.categories.map((option) => {
                  const on = category === option.slug;
                  return (
                    <button
                      key={option.slug}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setCategory(on ? "" : option.slug)}
                      className={`px-3 py-1.5 rounded-full text-xs font-light border transition-colors ${
                        on
                          ? "border-accent/70 bg-accent/10 text-accent"
                          : "border-border text-white/70 hover:border-white/25"
                      }`}
                    >
                      {option.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </fieldset>
      )}

      <div className="flex flex-col gap-3">
        <label className="block">
          <span className="sr-only">Your email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@yourkitchen.co.za"
            className={CONTROL}
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="sr-only">Your name</span>
            <input
              name="name"
              type="text"
              autoComplete="name"
              placeholder="Your name (optional)"
              className={CONTROL}
            />
          </label>
          <label className="block">
            <span className="sr-only">Your phone number</span>
            <input
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="082 123 4567 (optional)"
              className={CONTROL}
            />
          </label>
        </div>

        <label className="block">
          <span className="sr-only">What you are looking for</span>
          <textarea
            name="message"
            rows={onProduct ? 2 : 3}
            placeholder={
              onProduct
                ? `Anything else about the ${itemTitle ?? "machine"} you need? (optional)`
                : "What are you after? A six-burner, an under-counter fridge, a combi oven…"
            }
            className={`${CONTROL} resize-y leading-relaxed`}
          />
        </label>
      </div>

      {/* Consent. Unticked, one box per channel, naming the business.
          A pre-ticked box is not consent under POPIA s69, and Meta's opt-in
          policy separately requires that the sender be named. */}
      <fieldset className="mt-5 flex flex-col gap-2.5">
        <legend className="sr-only">How we may contact you</legend>
        <Consent name="emailConsent" id={`${id}-email-consent`}>
          Email me when {site.name} gets stock like this, and the monthly list of new
          arrivals.
        </Consent>
        <Consent name="whatsappConsent" id={`${id}-wa-consent`}>
          WhatsApp me too — it is usually faster.
        </Consent>
      </fieldset>

      {/* Bot check. Renders nothing at all when no site key is configured —
          local development and CI — so the form has no gap in it there.
          `resetKey` on the attempt count matters: a Turnstile token is
          single-use, and this form stays mounted after a failed submission, so
          without a reset the second attempt replays a spent token and is
          rejected for a reason the person cannot possibly act on. */}
      <Turnstile
        siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
        resetKey={attempts}
        className="mt-5"
      />

      {state && !state.ok && (
        <p className="mt-4 text-xs text-[#D47A85] bg-[#D47A85]/10 border border-[#D47A85]/30 rounded-xl px-3 py-2.5">
          {state.error}
        </p>
      )}

      <Submit label={copy.cta} />

      <p className="mt-4 text-[11px] font-light text-muted leading-relaxed">
        We only use this to tell you about equipment. Unsubscribe from any message.{" "}
        <a href="/privacy" className="text-white/80 hover:text-accent transition-colors underline underline-offset-2">
          How we handle your details
        </a>
        .
      </p>
    </form>
  );
}

function Consent({
  name,
  id,
  children,
}: {
  name: string;
  id: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 cursor-pointer group">
      <input
        id={id}
        name={name}
        type="checkbox"
        className="mt-0.5 w-4 h-4 shrink-0 rounded border-border bg-background accent-accent cursor-pointer"
      />
      <span className="text-xs font-light text-muted leading-relaxed group-hover:text-white/80 transition-colors">
        {children}
      </span>
    </label>
  );
}

/** Split out so useFormStatus can see the pending state of the form above it. */
function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="mt-5 w-full flex items-center justify-between gap-3 bg-accent text-background rounded-2xl px-6 py-4
        hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span className="text-sm font-medium">{pending ? "Sending…" : label}</span>
      {pending ? (
        <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
      ) : (
        <iconify-icon icon="solar:arrow-right-linear" width="18" height="18"></iconify-icon>
      )}
    </button>
  );
}
