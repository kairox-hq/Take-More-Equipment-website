/**
 * People, and the rules about writing to them.
 *
 * The database is authoritative for every one of these — app.lead_is_reachable()
 * gates the matcher and the campaign audience in SQL, where it cannot be
 * forgotten. This copy exists so the ops UI can grey out a button rather than
 * offering one that will fail, and so both apps spell "In the workshop" the
 * same way.
 */

export const LEAD_SOURCES = [
  "walk_in",
  "phone",
  "whatsapp",
  "website_product",
  "website_general",
  "referral",
  "auction",
  "import",
  "marketplace",
  "social_media",
  "google",
  "website",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_SOURCE_LABELS: Record<LeadSource, string> = {
  walk_in: "Walked in",
  phone: "Phoned us",
  whatsapp: "WhatsApp",
  website_product: "Website — a machine",
  website_general: "Website — general",
  referral: "Referred",
  auction: "Met at auction",
  import: "Imported list",
  marketplace: "Marketplace",
  social_media: "Social media",
  google: "Google",
  website: "Website",
};

/** Staff capture choices; historical sources keep their original meaning. */
export const CUSTOMER_SOURCES = ["whatsapp", "marketplace", "website", "social_media", "google", "walk_in", "referral"] as const satisfies readonly LeadSource[];

/**
 * Sources where the details were taken in the course of doing business.
 *
 * This is the first half of the existing-customer exception in POPIA s69: you
 * may market your own similar products to someone whose contact details you
 * obtained "in the context of the sale of a product or service", provided they
 * were given a chance to object then and in every message since. The second
 * half is that they actually bought — see `hasLawfulBasis` below.
 *
 * A website form is deliberately absent. Somebody filling in a box has not
 * bought anything, so that route needs a real ticked checkbox.
 */
const TRANSACTIONAL_SOURCES: readonly LeadSource[] = ["walk_in", "phone", "auction"];

export const LEAD_STATUSES = ["new", "working", "customer", "dormant"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  working: "Talking to them",
  customer: "Bought from us",
  dormant: "Gone quiet",
};

export const LEAD_EVENT_KINDS = [
  "note",
  "enquiry",
  "call",
  "visit",
  "email_sent",
  "whatsapp_sent",
  "match_sent",
  "purchased",
  "consent_given",
  "unsubscribed",
] as const;
export type LeadEventKind = (typeof LEAD_EVENT_KINDS)[number];

export const LEAD_EVENT_LABELS: Record<LeadEventKind, string> = {
  note: "Note",
  enquiry: "Enquiry",
  call: "Call",
  visit: "Visit",
  email_sent: "Email sent",
  whatsapp_sent: "WhatsApp sent",
  match_sent: "Told about a machine",
  purchased: "Bought",
  consent_given: "Consent",
  unsubscribed: "Opted out",
};

/** Iconify names, matching the Solar set the rest of both apps uses. */
export const LEAD_EVENT_ICONS: Record<LeadEventKind, string> = {
  note: "solar:notes-linear",
  enquiry: "solar:chat-round-line-linear",
  call: "solar:phone-linear",
  visit: "solar:shop-linear",
  email_sent: "solar:letter-linear",
  whatsapp_sent: "solar:chat-round-dots-linear",
  match_sent: "solar:magic-stick-3-linear",
  purchased: "solar:bag-check-linear",
  consent_given: "solar:shield-check-linear",
  unsubscribed: "solar:bell-off-linear",
};

/** The kinds that count as us having contacted them. Mirrors app.touch_lead_contacted. */
export const CONTACT_EVENT_KINDS: readonly LeadEventKind[] = [
  "call",
  "visit",
  "email_sent",
  "whatsapp_sent",
  "match_sent",
];

export const OUTREACH_CHANNELS = ["email", "whatsapp"] as const;
export type OutreachChannel = (typeof OUTREACH_CHANNELS)[number];

export const CHANNEL_LABELS: Record<OutreachChannel, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
};

export const OUTREACH_STATES = ["queued", "sent", "skipped", "failed"] as const;
export type OutreachState = (typeof OUTREACH_STATES)[number];

export const CAMPAIGN_STATES = ["draft", "sending", "sent", "failed"] as const;
export type CampaignState = (typeof CAMPAIGN_STATES)[number];

/**
 * The numbers the matcher enforces, restated for the UI to explain itself.
 *
 * SQL is where these actually bite — match_item_to_leads() is the only thing
 * that can queue a message — but a screen that says "we only message somebody
 * once a week" has to get the number from somewhere, and a hard-coded 7 in a
 * paragraph of copy is how the two come apart.
 */
export const MATCH_SCORE_FLOOR = 40;
/**
 * Days between messages about THE SAME WANT.
 *
 * Per want rather than per person, which is the whole point of lead_interests
 * being its own table. Somebody who asked for a fryer in March and a cold room
 * in June has had two conversations with us, and one of them going out on
 * Tuesday is not a reason to hold the other until the following week.
 */
export const FREQUENCY_CAP_DAYS = 7;
/**
 * However many wants somebody has recorded, this many unsolicited messages in
 * a rolling week is the ceiling.
 *
 * The backstop for the line above. "Per want" is only as sane as the wants
 * staff type in, and a customer with six interests on file is not getting six
 * emails on the same afternoon however well each one matches. Mirrored by the
 * `< 3` in match_item_to_leads(); change both or neither.
 */
export const OUTREACH_WEEKLY_CEILING = 3;
/** How far over a stated budget a machine may be and still be worth mentioning. */
export const BUDGET_GRACE = 0.1;

export type ConsentState = {
  emailConsentAt: string | null;
  whatsappConsentAt: string | null;
  unsubscribedAt: string | null;
  email: string | null;
  phoneE164: string | null;
};

/**
 * May we send this person an unsolicited message on this channel?
 *
 * The TypeScript twin of app.lead_is_reachable(). Consent alone is not enough —
 * an email opt-in with no email address is a promise we cannot keep — and the
 * opt-out overrides both, in that order, deliberately.
 */
export const isReachable = (lead: ConsentState, channel: OutreachChannel): boolean => {
  if (lead.unsubscribedAt) return false;
  return channel === "email"
    ? !!lead.emailConsentAt && !!lead.email
    : !!lead.whatsappConsentAt && !!lead.phoneE164;
};

/**
 * Which channel a match would go out on, or null if none may.
 *
 * WhatsApp wins where it is available: it is where this business already talks
 * to its customers, and while sending is a staff member tapping a wa.me link it
 * costs nothing. Mirrors the CASE in match_item_to_leads().
 */
export const preferredChannel = (lead: ConsentState): OutreachChannel | null => {
  if (isReachable(lead, "whatsapp")) return "whatsapp";
  if (isReachable(lead, "email")) return "email";
  return null;
};

/**
 * Why we are allowed to write to this person, in words, or null if we are not.
 *
 * Shown on the lead's page, because "can I put this person in the newsletter"
 * is a question staff will otherwise answer by guessing. The consent route is
 * checked first: it is the stronger basis, and the one a regulator would rather
 * hear about.
 */
export const lawfulBasis = (
  lead: ConsentState & { source: LeadSource; status: LeadStatus }
): string | null => {
  if (lead.unsubscribedAt) return null;
  if (lead.emailConsentAt || lead.whatsappConsentAt) return "They opted in";
  if (lead.status === "customer" && TRANSACTIONAL_SOURCES.includes(lead.source)) {
    return "Existing customer — similar products only";
  }
  return null;
};

/** The birthday list, without needing the year anyone was born. */
export const birthdayThisMonth = (birthday: string | null, now = new Date()): boolean => {
  if (!birthday) return false;
  // Parsed off the string rather than through Date, which would shift the day
  // across a timezone boundary and move somebody's birthday by one.
  const month = Number(birthday.slice(5, 7));
  return month === now.getMonth() + 1;
};
