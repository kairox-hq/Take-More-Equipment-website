"use server";

import { revalidatePath } from "next/cache";
import { supabase, requireStaff } from "@/lib/supabase";
import { sendMarketingEmail, type EmailMedia } from "@/lib/email";
import { draftMatchMessage, wantWords, type WantRef } from "@/lib/message";
import { photoUrls, videoClips, type MediaRef } from "@/lib/media";
import {
  atLeast,
  FREQUENCY_CAP_DAYS,
  OUTREACH_WEEKLY_CEILING,
  type OutreachState,
} from "@takemore/core";

/**
 * Working the queue, and starting a message that was never in it.
 *
 * Three verbs — send, skip, and pick-somebody-a-machine-by-hand — and all three
 * end in the same state change on an outreach_messages row. The timeline entry
 * and last_contacted_at are handled by database triggers, so there is nothing
 * here to forget.
 *
 * ONE SEND PATH. deliverEmail() below is the only function in the app that puts
 * a match in front of Resend, whether the suggestion came from the nightly
 * sweep or from somebody choosing a machine for a customer they are on the
 * phone to. That is deliberate: consent, the opt-out, the frequency caps and
 * "is this machine actually still for sale" are checked in one place, so the
 * deliberate path cannot quietly be the lenient one.
 *
 * The caps are re-applied HERE and not only in SQL, because the matcher applies
 * them when queueing and a suggestion can sit in the queue for a week. The
 * question that matters is whether we may write to this person about this want
 * at the moment somebody taps, not at the moment the machine arrived.
 */

export type OutreachResult =
  | { ok: true; notice?: string; whatsappUrl?: string }
  | { ok: false; error: string };

const day = (iso: string) => new Date(iso).toLocaleDateString("en-ZA");

/**
 * May we write to this person about this want, right now?
 *
 * The TypeScript twin of the two frequency guards in match_item_to_leads().
 * Both halves matter and they fail differently:
 *
 *   the same want twice in a week   — "we told you about a fryer on Tuesday"
 *   too many messages in a week     — the backstop for somebody whose record
 *                                     has six wants on it
 *
 * A message with no interest_id counts against everything, because it might
 * have been about this. That covers newsletters, which is the behaviour that
 * was here before the column existed and is worth keeping: a customer who got
 * the monthly list on Monday is not also getting a match email on Tuesday.
 *
 * Returns the sentence to show the staff member, or null to proceed.
 */
async function capsBlocking(
  leadId: string,
  interestId: string | null,
  /**
   * The row being re-sent, which must not block itself.
   *
   * Without this, every resend is refused by its own send: the message is
   * `sent`, it carries this interest_id, and it is minutes old, so it matches
   * the first guard perfectly. Excluding it asks the question that was actually
   * meant — "has anything ELSE gone to this person about this?"
   */
  excludeMessageId?: string
): Promise<string | null> {
  const client = await supabase();
  const since = new Date(Date.now() - FREQUENCY_CAP_DAYS * 86_400_000).toISOString();

  const query = client
    .from("outreach_messages")
    .select("sent_at, interest_id")
    .eq("lead_id", leadId)
    .eq("state", "sent")
    .gt("sent_at", since)
    .order("sent_at", { ascending: false });

  const { data } = await (excludeMessageId
    ? query.neq("id", excludeMessageId)
    : query);

  const recent = data ?? [];
  if (recent.length === 0) return null;

  const clash = recent.find(
    (message) =>
      message.interest_id === null ||
      (interestId !== null && message.interest_id === interestId)
  );
  if (clash?.sent_at) {
    return `We already wrote to them about this on ${day(clash.sent_at)}. Give it a week, or phone them instead.`;
  }

  if (recent.length >= OUTREACH_WEEKLY_CEILING) {
    return `They have had ${recent.length} messages from us this week already. Phone them instead.`;
  }

  return null;
}

/* ------------------------------------------------------------------------- */

type MessageForSending = {
  id: string;
  state: OutreachState;
  lead_id: string;
  interest_id: string | null;
  reason: string | null;
  lead: {
    full_name: string | null;
    email: string | null;
    unsubscribed_at: string | null;
    email_consent_at: string | null;
    unsubscribe_token: string;
    deleted_at: string | null;
  } | null;
  interest: WantRef;
  item: {
    title: string;
    brand: string | null;
    slug: string;
    list_price_cents: number | null;
    condition_grade: "N" | "A" | "B" | "C" | null;
    status: string;
    available_quantity: number;
    published_at: string | null;
    deleted_at: string | null;
    media: MediaRef[];
  } | null;
};

const MESSAGE_SELECT = `
  id, state, lead_id, interest_id, reason,
  lead:leads(full_name, email, unsubscribed_at, email_consent_at, unsubscribe_token, deleted_at),
  interest:lead_interests(description,
                          category:categories(name),
                          subcategory:subcategories(name)),
  item:items(title, brand, slug, list_price_cents, condition_grade,
             status, available_quantity, published_at, deleted_at,
             media:item_media(kind, storage_path, external_url, position,
                              duration_seconds))
`;

/**
 * Everything the customer will actually receive, built from one message row.
 *
 * Split out so the queue and the one-off send cannot differ by a photograph.
 * The gallery is capped inside wrap(); what is capped HERE is nothing, because
 * the item page is what the email links to when there is more.
 */
function composeFor(message: MessageForSending): {
  body: string;
  subject: string;
  media: EmailMedia;
} {
  const item = message.item!;
  const photos = photoUrls(item.media);
  const videos = videoClips(item.media);

  const body = draftMatchMessage(
    {
      leadName: message.lead?.full_name ?? null,
      ...wantWords(message.interest, message.reason),
      itemTitle: item.title,
      itemBrand: item.brand,
      itemSlug: item.slug,
      itemPriceCents: item.list_price_cents,
      itemGrade: item.condition_grade,
      photoCount: photos.length,
      videoCount: videos.length,
    },
    "email"
  );

  return {
    body,
    subject: `We found you ${[item.brand, item.title].filter(Boolean).join(" ")}`,
    media: { photos, videos },
  };
}

/**
 * How long a claim holds before the row may be tried again.
 *
 * A send is a few seconds. A claim older than this belongs to a process that
 * died between claiming and finishing, and holding the row forever for it
 * would mean a draft nobody can send and nobody can see why.
 */
const CLAIM_TTL_MS = 2 * 60_000;

/**
 * Take the row, atomically, before anything is sent.
 *
 * Two taps on Send used to be two emails: both requests read the row as
 * `queued`, both handed it to Resend, and both wrote `sent`. This is the one
 * UPDATE that can only succeed for one of them — the `claimed_at is null`
 * condition is evaluated inside Postgres, so whichever request lands second
 * touches zero rows and stops. `expectedState` is `queued` for a first send
 * and `sent` for a resend, so a claim never moves a row it did not expect.
 *
 * Returns true when this caller now owns the row.
 */
async function claimMessage(
  messageId: string,
  expectedState: OutreachState
): Promise<boolean> {
  const client = await supabase();
  const stale = new Date(Date.now() - CLAIM_TTL_MS).toISOString();
  const { count, error } = await client
    .from("outreach_messages")
    .update({ claimed_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", messageId)
    .eq("state", expectedState)
    .or(`claimed_at.is.null,claimed_at.lt.${stale}`);
  if (error) return false;
  return (count ?? 0) > 0;
}

/** Let go of a claim after a send that did not happen. */
async function releaseClaim(messageId: string): Promise<void> {
  const client = await supabase();
  await client.from("outreach_messages").update({ claimed_at: null }).eq("id", messageId);
}

const BUSY = "That one is being sent right now. Give it a moment.";

/**
 * Send one queued match by email, now, from the server.
 *
 * `body` is what the staff member has in front of them — possibly edited, and
 * that edit must win. Null means "you compose it", which is what the one-off
 * path passes because there was never a textarea.
 */
async function deliverEmail(
  messageId: string,
  body: string | null,
  staffUserId: string,
  /**
   * Send it again even though it has already gone.
   *
   * Only ever true from the Sent list, where a human is looking at a message
   * they know went out and has decided this person should have it again. The
   * frequency caps still apply — this lifts the "already sent" short-circuit,
   * not the protection around how often somebody may be written to.
   */
  resend = false
): Promise<OutreachResult> {
  const client = await supabase();

  const { data } = await client
    .from("outreach_messages")
    .select(MESSAGE_SELECT)
    .eq("id", messageId)
    .maybeSingle();

  const message = data as unknown as MessageForSending | null;
  if (!message) return { ok: false, error: "That suggestion is no longer there." };
  if (message.state === "sent" && !resend) return { ok: true, notice: "Already sent." };

  const { lead, item } = message;

  // Re-checked at the moment of sending, not just at the moment of queueing.
  // Somebody can opt out in the days a suggestion sits waiting, and the queue is
  // a snapshot. A deleted person is the strongest form of that — the database
  // refuses the write too (outreach_messages_refuse_deleted), but the sentence
  // here is the one a staff member actually reads.
  if (!lead) return { ok: false, error: "That person is no longer on the system." };
  if (lead.deleted_at) return { ok: false, error: "That person has been deleted. Nothing sent." };
  if (!lead.email) return { ok: false, error: "No email address on file." };
  if (lead.unsubscribed_at) return { ok: false, error: "They have opted out. Nothing sent." };
  if (!lead.email_consent_at) {
    return {
      ok: false,
      error: "They have not agreed to emails. Ask first, then record it on their page.",
    };
  }

  // And the machine, for the same reason. A suggestion that has been sitting in
  // the queue since Tuesday can be about something that sold on Wednesday, and
  // an email about a machine somebody cannot buy is worse than no email.
  if (!item) return { ok: false, error: "That machine is no longer on the system." };
  if (item.deleted_at || !item.published_at || item.status !== "listed" || item.available_quantity < 1) {
    return { ok: false, error: "That machine is no longer for sale. Nothing sent." };
  }

  const blocked = await capsBlocking(
    message.lead_id,
    message.interest_id,
    resend ? messageId : undefined
  );
  if (blocked) return { ok: false, error: blocked };

  // Every check above can be passed by two requests at once. This cannot.
  if (!(await claimMessage(messageId, resend ? "sent" : "queued"))) {
    return { ok: false, error: BUSY };
  }

  const composed = composeFor(message);
  const finalBody = body ?? composed.body;

  const result = await sendMarketingEmail({
    to: lead.email,
    subject: composed.subject,
    body: finalBody,
    unsubscribeToken: lead.unsubscribe_token,
    media: composed.media,
  });

  if (!result.ok) {
    // Recorded as failed rather than left queued, so the outreach_once index
    // lets it be tried again — `failed` is the one state that does not block.
    await client
      .from("outreach_messages")
      .update({ state: "failed", body: finalBody, error: result.error, claimed_at: null })
      .eq("id", messageId);
    revalidatePath("/outreach");
    return { ok: false, error: result.error };
  }

  const { error } = await client
    .from("outreach_messages")
    .update({
      state: "sent",
      body: finalBody,
      sent_at: new Date().toISOString(),
      sent_by: staffUserId,
      error: null,
      claimed_at: null,
    })
    .eq("id", messageId);

  if (error) {
    await releaseClaim(messageId);
    return { ok: false, error: error.message };
  }

  revalidatePath("/outreach");
  revalidatePath("/leads");
  revalidatePath(`/leads/${message.lead_id}`);
  return { ok: true, notice: `Sent to ${lead.email}.` };
}

/* ------------------------------------------------------------------------- */

/**
 * Mark a WhatsApp suggestion as sent.
 *
 * The actual sending is the staff member tapping through to WhatsApp, so this
 * records the fact rather than performing it. Called after the wa.me link opens.
 * Believing the tap is a deliberate trade: the alternative is the Meta Cloud
 * API, which costs about R1.50 a message and needs template approval before a
 * single word can be sent.
 */
export async function markSent(
  messageId: string,
  body: string
): Promise<OutreachResult> {
  const staff = await requireStaff();
  const client = await supabase();

  const { data: message } = await client
    .from("outreach_messages")
    .select("lead_id, interest_id, state, lead:leads(deleted_at)")
    .eq("id", messageId)
    .maybeSingle();

  if (!message) return { ok: false, error: "That suggestion is no longer there." };
  if (message.state === "sent") return { ok: true, notice: "Already sent." };
  if ((message.lead as { deleted_at: string | null } | null)?.deleted_at) {
    return { ok: false, error: "That person has been deleted. Nothing logged." };
  }

  const blocked = await capsBlocking(message.lead_id, message.interest_id);
  if (blocked) return { ok: false, error: blocked };

  // Same claim as the email path. Nothing is delivered from here, but two taps
  // still wrote two timeline entries and two last_contacted_at bumps.
  if (!(await claimMessage(messageId, "queued"))) return { ok: false, error: BUSY };

  const { error } = await client
    .from("outreach_messages")
    .update({
      state: "sent",
      body,
      sent_at: new Date().toISOString(),
      sent_by: staff.userId,
      claimed_at: null,
    })
    .eq("id", messageId);

  if (error) {
    await releaseClaim(messageId);
    return { ok: false, error: error.message };
  }

  revalidatePath("/outreach");
  revalidatePath("/leads");
  return { ok: true, notice: "Logged on their timeline." };
}

/** Send a queued suggestion by email, now, from the server. */
export async function sendByEmail(
  messageId: string,
  body: string
): Promise<OutreachResult> {
  const staff = await requireStaff();
  return deliverEmail(messageId, body, staff.userId);
}

/**
 * Send it again.
 *
 * WHY THIS EXISTS AT ALL
 * ----------------------
 * "Sent" on a WhatsApp suggestion is the app's best guess, not a fact. All it
 * observed was the tap that opened WhatsApp with the message written out; what
 * happened next — pressing send, closing the tab, the phone being locked, the
 * customer's number turning out to be wrong — happens somewhere this app cannot
 * see. Recording it as sent is the honest reading of the last observable event,
 * and the honest consequence is that the row must stay reachable.
 *
 * So the two channels are treated differently, because the risk is different:
 *
 *   whatsapp — reopens the conversation and re-stamps the time. No cap check:
 *              nothing is delivered by this app, a person is being handed their
 *              own chat window, and refusing that would only teach staff to
 *              copy the text out by hand.
 *   email    — actually sends, from us, unprompted. Every frequency cap applies
 *              exactly as it does the first time, minus this row's own send.
 */
export async function resendMessage(
  messageId: string,
  body: string
): Promise<OutreachResult> {
  const staff = await requireStaff();
  const client = await supabase();

  const { data: message } = await client
    .from("outreach_messages")
    .select("lead_id, channel, state")
    .eq("id", messageId)
    .maybeSingle();

  if (!message) return { ok: false, error: "That message is no longer there." };
  if (message.state !== "sent") {
    return { ok: false, error: "That one has not gone out yet — send it from the queue." };
  }

  if (message.channel === "email") {
    return deliverEmail(messageId, body, staff.userId, true);
  }

  const { error } = await client
    .from("outreach_messages")
    .update({
      body,
      sent_at: new Date().toISOString(),
      sent_by: staff.userId,
    })
    .eq("id", messageId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/outreach");
  revalidatePath("/leads");
  revalidatePath(`/leads/${message.lead_id}`);
  return { ok: true, notice: "Opened again, and logged on their timeline." };
}

/**
 * One email, to one person, about one machine, chosen by a human.
 *
 * The path that does not wait for the nightly sweep. Somebody is looking at a
 * customer's page — or pricing a machine and reading who wanted one — and knows
 * the pairing is right. This queues that exact pairing and sends it in one go.
 *
 * The (lead, interest, item) triple is the whole point. A customer with two
 * recorded wants and two matching machines is sent two separate emails, one per
 * machine, each quoting the want it answers — never one email listing both,
 * which reads as a catalogue and converts like one. The database keeps that
 * true from the other side: outreach_messages holds a single item_id and a
 * single interest_id, and the outreach_once index means the same person can
 * never be written to twice about the same machine however many of their wants
 * it happens to match.
 */
export async function emailLeadAboutItem(
  leadId: string,
  interestId: string,
  itemId: string
): Promise<OutreachResult> {
  const staff = await requireStaff();
  const client = await supabase();

  // The want has to belong to this person. Without this a mistyped id would
  // send somebody an email about somebody else's machine, quoting somebody
  // else's words — the single worst failure this feature has available to it.
  const { data: interest } = await client
    .from("lead_interests")
    .select("id, description")
    .eq("id", interestId)
    .eq("lead_id", leadId)
    .maybeSingle();

  if (!interest) {
    return { ok: false, error: "That want is not on this person's record." };
  }

  const blocked = await capsBlocking(leadId, interestId);
  if (blocked) return { ok: false, error: blocked };

  // Find, then create. outreach_once permits exactly one non-failed row per
  // (person, machine, channel), so inserting blind would collide with a
  // suggestion the matcher already queued for this same pairing — and the right
  // answer to that is to send THAT row, not to fail.
  const { data: existingRows } = await client
    .from("outreach_messages")
    .select("id, state")
    .eq("lead_id", leadId)
    .eq("item_id", itemId)
    .eq("channel", "email");

  const existing = (existingRows ?? []).find((row) => row.state !== "failed");

  if (existing?.state === "sent") {
    return { ok: true, notice: "We have already told them about this one." };
  }

  let messageId = existing?.id;

  if (existing) {
    // Queued, or skipped. A skip is a decision the matcher must respect, but a
    // person deliberately choosing this machine for this customer now is a
    // later and better-informed decision, so it wins — and it is attributed to
    // the want they picked it for.
    const { error } = await client
      .from("outreach_messages")
      .update({ state: "queued", interest_id: interestId, error: null })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const words = interest.description.trim();
    const { data: created, error } = await client
      .from("outreach_messages")
      .insert({
        lead_id: leadId,
        interest_id: interestId,
        item_id: itemId,
        channel: "email",
        // No match_score: nothing scored this. Saying who chose it is the
        // honest version, and it is what the timeline will carry.
        reason: `Chosen for them by ${staff.fullName}${words ? ` · "${words.slice(0, 90)}"` : ""}`,
      })
      .select("id")
      .single();

    if (error) return { ok: false, error: error.message };
    messageId = created.id;
  }

  if (!messageId) return { ok: false, error: "Could not start that message." };

  const sent = await deliverEmail(messageId, null, staff.userId);

  // The matcher may have queued the same pairing on WhatsApp — it prefers that
  // channel where it can. Now that the email has gone, that draft is a second
  // message about the same machine waiting for somebody to tap it. Retire it,
  // and say why, so the queue does not quietly offer a duplicate tomorrow.
  if (sent.ok) {
    await client
      .from("outreach_messages")
      .update({ state: "skipped", skipped_reason: "emailed instead" })
      .eq("lead_id", leadId)
      .eq("item_id", itemId)
      .eq("channel", "whatsapp")
      .eq("state", "queued");
  }

  return sent;
}

/**
 * Not this one.
 *
 * A skipped suggestion stays skipped — the outreach_once index covers every
 * state except `failed` — so tonight's sweep will not put it back. That is the
 * whole reason the index is written the way it is. Choosing the machine by hand
 * from the customer's own page is the deliberate way to undo it.
 */
export async function skipMessage(
  messageId: string,
  reason?: string
): Promise<OutreachResult> {
  await requireStaff();
  const client = await supabase();

  const { error } = await client
    .from("outreach_messages")
    .update({ state: "skipped", skipped_reason: reason?.trim() || null })
    .eq("id", messageId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/outreach");
  return { ok: true };
}

/**
 * Look for matches now, rather than waiting for tonight.
 *
 * The same function the publish path and the nightly sweep call. Safe to press
 * repeatedly — the unique index absorbs every repeat.
 */
export async function runMatchNow(): Promise<OutreachResult> {
  const staff = await requireStaff();
  // Any approved account, since ranks were removed — atLeast() says yes to
  // every staff role. Kept as the seam where a rank would go back.
  if (!atLeast(staff.role, "manager")) {
    return { ok: false, error: "Not permitted." };
  }

  const client = await supabase();
  const { data, error } = await client.rpc("run_stock_match");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/outreach");
  return {
    ok: true,
    notice:
      data === 0
        ? "Nothing new to suggest — everyone who matches has already been told."
        : `${data} new ${data === 1 ? "suggestion" : "suggestions"}.`,
  };
}
