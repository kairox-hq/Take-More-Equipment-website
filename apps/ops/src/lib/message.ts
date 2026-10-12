
import { gradeLabel } from "@takemore/core";
import { randsExact as rands, type OutreachChannel } from "@takemore/core";

/**
 * The draft a staff member sends.
 *
 * Written here rather than in SQL deliberately. The matcher decides WHO should
 * hear about a machine — that is a rule, and rules live in Postgres where they
 * cannot be forgotten. What to SAY is a different kind of decision: it depends
 * on the storefront's URL, on how this business talks, and on whether the person
 * sending it wants to change a word before they do. None of that belongs in a
 * trigger.
 *
 * Three things every message must do, in this order:
 *   1. Use their name.
 *   2. Say what THEY told us they wanted, in their words where we have them.
 *      This is the whole difference between "we remembered you" and a blast.
 *   3. Give them the machine and a link, and then stop.
 *
 * No photos are attached. On WhatsApp the link preview renders the item's own
 * OG image — which the storefront already generates from its first photo — so
 * the picture arrives without a 4 MB upload through somebody's phone data. On
 * email the template embeds the item's photographs and links its clips; see
 * EmailMedia in lib/email.ts for why embedded and linked rather than attached.
 *
 * ONE MESSAGE IS ABOUT ONE MACHINE, ALWAYS. A customer with two recorded wants
 * and two matching machines gets two emails, each quoting the want it answers,
 * because "we also have this other thing" is a catalogue and "you asked for a
 * cold room, here is a cold room" is a reason to reply. The database enforces
 * the same shape: outreach_messages carries a single item_id and a single
 * interest_id.
 */

export type MatchContext = {
  leadName: string | null;
  /** What they said they were looking for, in their own words. May be empty. */
  want: string | null;
  /** The category or subcategory they asked for, as a fallback for `want`. */
  wantCategory: string | null;
  itemTitle: string;
  itemBrand: string | null;
  itemSlug: string;
  itemPriceCents: number | null;
  itemGrade: "N" | "A" | "B" | "C" | null;
  /** How many photographs the email will carry, so the copy can point at them. */
  photoCount?: number;
  /** How many clips, same reason. */
  videoCount?: number;
};

const firstName = (full: string | null): string => {
  const name = (full ?? "").trim().split(/\s+/)[0];
  return name || "there";
};

export const itemUrl = (slug: string): string => {
  const base =
    process.env.NEXT_PUBLIC_STOREFRONT_URL ??
    process.env.STOREFRONT_URL ??
    "https://takemoreequipment.co.za";
  return `${base.replace(/\/$/, "")}/stock/${slug}`;
};

/**
 * The reminder clause — the sentence that proves this is not a blast.
 *
 * Their own words win over the category every time. "you were after something
 * to keep drinks cold for the shop" lands; "you were interested in
 * Refrigeration" reads like a database, because it is one.
 */
const because = (context: MatchContext): string => {
  const want = context.want?.trim();
  if (want) {
    const trimmed = want.length > 90 ? `${want.slice(0, 87).trimEnd()}…` : want;
    return `you told us you were after ${trimmed.replace(/\.$/, "")}`;
  }
  if (context.wantCategory) return `you were looking for ${context.wantCategory.toLowerCase()}`;
  return "you were looking for equipment";
};

const describe = (context: MatchContext): string =>
  [context.itemBrand, context.itemTitle].filter(Boolean).join(" ");

/**
 * A sentence pointing at what the template is about to render below.
 *
 * Email only. Somebody who scrolls past the first photograph should know there
 * is more to scroll to, and a clip of the machine actually running is the
 * single most persuasive thing this business owns — it is the difference
 * between "second-hand" and "tested". Silent when there is nothing to point at,
 * rather than promising photographs that are not there.
 */
const showing = (context: MatchContext): string | null => {
  const photos = context.photoCount ?? 0;
  const clips = context.videoCount ?? 0;

  if (clips > 0 && photos > 1) {
    return "The photographs are below, and there is a clip of it actually running.";
  }
  if (clips > 0) return "There is a clip of it actually running below.";
  if (photos > 1) return "A few more photographs are below.";
  return null;
};

export function draftMatchMessage(
  context: MatchContext,
  channel: OutreachChannel
): string {
  const price = context.itemPriceCents ? rands(context.itemPriceCents) : null;
  const grade = context.itemGrade ? gradeLabel(context.itemGrade) : null;
  const spec = [price, grade].filter(Boolean).join(", ");

  if (channel === "whatsapp") {
    // Short. A WhatsApp message that needs a "read more" tap gets neither.
    return [
      `Hi ${firstName(context.leadName)}, it's Take More.`,
      "",
      `A while back ${because(context)} — one has just come through the workshop.`,
      "",
      `${describe(context)}${spec ? ` — ${spec}` : ""}`,
      itemUrl(context.itemSlug),
      "",
      "Happy to hold it while you come and look at it. Still one of one, so it will not sit long.",
    ].join("\n");
  }

  const media = showing(context);

  return [
    `Hi ${firstName(context.leadName)},`,
    "",
    `A while back ${because(context)}. One has just come through the workshop and is on the site now.`,
    "",
    `${describe(context)}${spec ? ` — ${spec}` : ""}`,
    itemUrl(context.itemSlug),
    ...(media ? ["", media] : []),
    "",
    "Everything we list is stripped, tested and graded before it goes up, and you are welcome to come and watch it run in Montague Gardens before you pay anything.",
    "",
    "Reply to this and we will hold it for you.",
    "",
    "— Take More Catering Equipment",
  ].join("\n");
}

/**
 * A want, as every caller that has one selects it.
 *
 * The interest row itself is the truth. The reason string is the fallback, and
 * only for rows queued before outreach_messages knew which want it was
 * answering — the matcher already puts the customer's own words in there, in
 * quotes, so pulling them back out is lossy but never wrong.
 */
export type WantRef = {
  description: string;
  category: { name: string } | null;
  subcategory: { name: string } | null;
} | null;

export function wantWords(
  interest: WantRef,
  reason: string | null
): Pick<MatchContext, "want" | "wantCategory"> {
  const wantCategory = interest?.subcategory?.name ?? interest?.category?.name ?? null;
  const description = interest?.description?.trim();
  if (description) return { want: description, wantCategory };

  const quoted = reason?.match(/"([^"]+)"/)?.[1] ?? null;
  return { want: quoted, wantCategory };
}

/** wa.me with the draft pre-filled. The staff member is the sender. */
export const whatsappSendLink = (digits: string, body: string): string =>
  `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;

/**
 * The message that carries an invoice.
 *
 * Short, and it says the three things somebody needs to recognise it before
 * they open an attachment from a number they may not have saved: who it is
 * from, what it is for, and the amount. A document arriving with no words
 * around it looks like a phishing attempt, which is the actual risk here.
 *
 * A proforma asks; an invoice thanks. The difference matters more than the
 * wording suggests — one of these is a request for money and the other is a
 * receipt, and a customer who reads the wrong one either pays twice or not at
 * all.
 *
 * The PDF itself is NOT in this string. wa.me can only pre-fill text — there is
 * no parameter for a file, and there never has been — so the attachment travels
 * one of two other ways: the phone's own share sheet, which hands WhatsApp the
 * real file, or the staff member attaching it after this message opens. See
 * InvoicePanel for which happens when.
 */
export function draftInvoiceMessage(context: {
  kind: "proforma" | "invoice";
  number: string;
  leadName: string | null;
  totalCents: number;
  receivedCents?: number;
  balanceCents?: number;
  /** Set only when the machines are coming to them rather than being collected. */
  delivering: boolean;
  /**
   * Whether the document actually carries the banking block. A deployment
   * with no BUSINESS_BANK_* configured prints none, and a message promising
   * "the banking details are on it" would then be a promise the paper breaks.
   */
  bankOnDocument?: boolean;
}): string {
  const total = rands(context.totalCents);

  if (context.kind === "proforma" || (context.balanceCents ?? 0) > 0) {
    return [
      `Hi ${firstName(context.leadName)}, it's Take More.`,
      "",
      `Here is ${context.number} for your order — total ${total}${context.receivedCents ? `, received ${rands(context.receivedCents)}` : ""}${context.balanceCents != null ? `, outstanding ${rands(context.balanceCents)}` : ""}.`,
      "Please use your name and surname as the payment reference.",
      "",
      context.bankOnDocument === false
        ? "Let us know when you're ready to pay and we'll send you the banking details."
        : "The banking details are on it. Send us the proof of payment and we'll get it ready.",
    ].join("\n");
  }

  return [
    `Hi ${firstName(context.leadName)}, it's Take More.`,
    "",
    // "Here is", not "is attached". On a phone the file really is attached; on
    // a desktop the salesperson attaches it a moment later, and a message that
    // has already claimed an attachment reads badly in the second it takes them
    // — or worse, if they forget.
    `Thanks — that's paid. Here is invoice ${context.number}, ${total}.`,
    "",
    context.delivering
      ? "We'll be in touch about the delivery. Keep this as your purchase reference."
      : "Keep this as your purchase reference. Contact our team if you have a question.",
  ].join("\n");
}

/** A draft for staff to review; preparing it never sends a message. */
export function draftPaymentReminder(context: { name: string | null; code: string; amount: number; due: string | null }): string {
  return [`Hi ${context.name?.trim() || "there"}, it’s Take More.`, "",
    `Payment reminder for ${context.code}: ${rands(context.amount)}${context.due ? ` due on ${context.due}` : " outstanding"}.`,
    "Please use your name and surname as the payment reference.",
    "If you have already paid, please send us your proof of payment so we can check and update your balance."] .join("\n");
}
