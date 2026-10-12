"use client";

import { gradeLabel } from "@takemore/core";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Button,
  ChipGroup,
  Field,
  Input,
  Panel,
  RandInput,
  Select,
  Textarea,
} from "@takemore/ui";
import {
  CONDITION_GRADES,
  LEAD_EVENT_ICONS,
  LEAD_EVENT_LABELS,
  CUSTOMER_SOURCES,
  LEAD_SOURCE_LABELS,
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  formatPhone,
  isReachable,
  lawfulBasis,
  normalisePhone,
  whatsappDigits,
  type AppRole,
} from "@takemore/core";
import type { LeadEventRow, LeadInterestRow, LeadRow, MatchingItem } from "@/lib/leads";
import { byDivision, type CategoryOption } from "@/lib/catalogue";
import StockForWant from "./StockForWant";
import {
  addEvent,
  addInterest,
  deleteInterest,
  fulfilInterest,
  setConsent,
  setInterestTags,
  setUnsubscribed,
  updateInterest,
  updateLead,
  type ActionResult,
  type LeadPatch,
} from "../actions";

/**
 * One person, everything we know about them.
 *
 * Same autosave-on-blur shape as ItemEditor: local state, a commit() helper
 * that only writes when a field actually changed, and a transient "Saved"
 * marker. A warehouse phone loses focus constantly, and a form with a Save
 * button at the bottom is a form that loses half its edits.
 *
 * The panel order is the order the conversation happens in: who they are, what
 * they want, what we have said, and only then the consent controls — which are
 * last because they are the one thing nobody should be able to change by
 * accident on the way past.
 */
export default function LeadEditor({
  lead,
  events,
  categories,
  subcategories,
  tags,
  stock,
  role,
}: {
  lead: LeadRow;
  events: LeadEventRow[];
  categories: CategoryOption[];
  subcategories: { id: string; name: string; category_id: string }[];
  tags: { id: string; name: string }[];
  /** Live stock answering each active want, keyed by interest id. */
  stock: Record<string, MatchingItem[]>;
  role: AppRole;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    full_name: lead.full_name ?? "",
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    birthday: lead.birthday ?? "",
    business_name: lead.business_name ?? "",
    notes: lead.notes ?? "",
  });
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const report = useCallback(
    (result: ActionResult) => {
      if (result.ok) {
        setSaveState("saved");
        setError(null);
        setNotice(result.notice ?? null);
        setTimeout(() => setSaveState("idle"), 1800);
        router.refresh();
      } else {
        setSaveState("error");
        setError(result.error);
      }
    },
    [router]
  );

  const save = useCallback(
    async (patch: LeadPatch) => {
      setSaveState("saving");
      report(await updateLead(lead.id, patch));
    },
    [lead.id, report]
  );

  /**
   * Commit a text field on blur, but only if it actually changed.
   *
   * Every key of `form` is a nullable text column on `lead`, so comparing
   * against `lead[key] ?? ""` is well typed — the keys are constrained by the
   * type of `form`, not by a cast.
   */
  const commit = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
    onBlur: () => {
      const raw = form[key];
      if (raw === (lead[key] ?? "")) return;
      save({ [key]: raw === "" ? null : raw } as LeadPatch);
    },
  });

  const basis = lawfulBasis({
    emailConsentAt: lead.email_consent_at,
    whatsappConsentAt: lead.whatsapp_consent_at,
    unsubscribedAt: lead.unsubscribed_at,
    email: lead.email,
    phoneE164: lead.phone_e164,
    source: lead.source,
    status: lead.status,
  });

  const waDigits = whatsappDigits(lead.phone);
  const active = lead.interests.filter((i) => i.active);
  const found = lead.interests.filter((i) => !i.active);

  // Whether the "email them about it" buttons below may appear at all. The same
  // rule as app.lead_is_reachable() in SQL, which is what would refuse the send
  // anyway — this only decides between a button and an explanation.
  const canEmail = isReachable(
    {
      emailConsentAt: lead.email_consent_at,
      whatsappConsentAt: lead.whatsapp_consent_at,
      unsubscribedAt: lead.unsubscribed_at,
      email: lead.email,
      phoneE164: lead.phone_e164,
    },
    "email"
  );

  return (
    <div className="space-y-4">
      {/* Header: the three things you need before you say hello */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-medium tracking-tight truncate">
            {form.full_name || form.email || formatPhone(form.phone) || "No name yet"}
          </h1>
          <p className="text-xs font-light text-muted mt-1">
            {[
              LEAD_SOURCE_LABELS[lead.source],
              lead.business_name,
              `added ${new Date(lead.created_at).toLocaleDateString("en-ZA")}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {saveState === "saving" && (
            <span className="text-[11px] font-light text-muted">Saving…</span>
          )}
          {saveState === "saved" && (
            <span className="text-[11px] font-light text-accent">Saved</span>
          )}
          {waDigits && (
            <a
              href={`https://wa.me/${waDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border border-border rounded-xl px-3 py-2 text-xs
                         font-light text-white/80 hover:border-white/25 transition-colors"
            >
              <iconify-icon icon="solar:chat-round-line-linear" width="14" height="14" noobserver="" />
              WhatsApp
            </a>
          )}
          {lead.phone && (
            <a
              href={`tel:${normalisePhone(lead.phone) ?? lead.phone}`}
              className="inline-flex items-center gap-2 border border-border rounded-xl px-3 py-2 text-xs
                         font-light text-white/80 hover:border-white/25 transition-colors"
            >
              <iconify-icon icon="solar:phone-linear" width="14" height="14" noobserver="" />
              Call
            </a>
          )}
        </div>
      </div>

      {error && (
        <div className="text-xs text-status-sold bg-status-sold/10 border border-status-sold/30 rounded-xl px-3 py-2.5">
          {error}
        </div>
      )}
      {notice && (
        <div className="text-xs text-accent bg-accent/10 border border-accent/30 rounded-xl px-3 py-2.5">
          {notice}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      <Panel title="Who they are">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Name">
            <Input {...commit("full_name")} placeholder="Sipho Ndlovu" />
          </Field>

          <Field label="Business">
            <Input {...commit("business_name")} placeholder="Spur, Claremont" />
          </Field>

          <Field
            label="Phone"
            hint={
              form.phone && normalisePhone(form.phone)
                ? formatPhone(form.phone)
                : form.phone
                  ? "Not a full number"
                  : undefined
            }
          >
            <Input {...commit("phone")} type="tel" inputMode="tel" placeholder="082 123 4567" />
          </Field>

          <Field label="Email">
            <Input {...commit("email")} type="email" placeholder="sipho@kitchen.co.za" />
          </Field>

          <Field label="Birthday" hint="The year does not matter">
            <Input {...commit("birthday")} type="date" />
          </Field>

          <Field label="Where they came from">
            <Select
              value={lead.source}
              onChange={(e) => save({ source: e.target.value as LeadRow["source"] })}
            >
              {!CUSTOMER_SOURCES.some(s => s === lead.source) && <option value={lead.source}>{LEAD_SOURCE_LABELS[lead.source]}</option>}
              {CUSTOMER_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_SOURCE_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-3">
          <Field label="How we are doing with them">
            <div className="flex flex-wrap gap-2">
              {LEAD_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => save({ status: s })}
                  className={`px-3 py-1.5 rounded-full text-xs font-light border transition-colors ${
                    lead.status === s
                      ? "border-accent/70 bg-accent/10 text-accent"
                      : "border-border text-white/70 hover:border-white/25"
                  }`}
                >
                  {LEAD_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </Field>
        </div>

        <div className="mt-3">
          <Field label="Anything else worth knowing" hint="Only staff see this">
            <Textarea
              {...commit("notes")}
              rows={3}
              placeholder="Collects on Saturdays. Runs two kitchens. Knows Ahmed."
            />
          </Field>
        </div>
      </Panel>

      {/* ---------------------------------------------------------------- */}
      <Panel
        title="What they are looking for"
        subtitle="This is what the stock matcher reads. The more of it that is filled in, the better it works. Each want is watched on its own, and each one gets its own message."
        actions={
          <Button
            variant="secondary"
            onClick={async () => report(await addInterest(lead.id))}
            className="text-xs px-3 py-2"
          >
            Add another
          </Button>
        }
      >
        {active.length === 0 && (
          <p className="text-xs font-light text-muted">
            Nothing recorded. Add what they asked for and we will watch stock for them.
          </p>
        )}

        <div className="space-y-4">
          {active.map((interest) => (
            <InterestCard
              key={interest.id}
              leadId={lead.id}
              interest={interest}
              categories={categories}
              subcategories={subcategories}
              tags={tags}
              matches={stock[interest.id] ?? []}
              canEmail={canEmail}
              onResult={report}
            />
          ))}
        </div>

        {found.length > 0 && (
          <div className="mt-5 pt-4 border-t border-white/5">
            <p className="text-[11px] font-light text-muted mb-2">Already found</p>
            <ul className="space-y-1">
              {found.map((interest) => (
                <li key={interest.id} className="text-xs font-light text-muted/70">
                  {[interest.subcategory?.name ?? interest.category?.name, interest.description]
                    .filter(Boolean)
                    .join(" · ") || "Unspecified"}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>

      {/* ---------------------------------------------------------------- */}
      <Panel title="What we have said" subtitle="Every message, note and enquiry, newest first.">
        <NoteBox leadId={lead.id} onResult={report} />

        {events.length === 0 ? (
          <p className="text-xs font-light text-muted mt-4">Nothing yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {events.map((event) => (
              <li key={event.id} className="flex gap-3">
                <span className="w-7 h-7 shrink-0 rounded-lg bg-background border border-border flex items-center justify-center text-muted">
                  <iconify-icon
                    icon={LEAD_EVENT_ICONS[event.kind]}
                    width="13"
                    height="13"
                    noobserver=""
                  />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-light text-white/85 leading-relaxed">
                    {event.body || LEAD_EVENT_LABELS[event.kind]}
                  </p>
                  <p className="text-[11px] font-light text-muted mt-0.5">
                    {[
                      LEAD_EVENT_LABELS[event.kind],
                      event.actor?.full_name ?? "the website",
                      new Date(event.created_at).toLocaleString("en-ZA", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }),
                    ].join(" · ")}
                    {event.item && (
                      <>
                        {" · "}
                        <Link
                          href={`/items?q=${encodeURIComponent(event.item.title)}`}
                          className="text-white/70 hover:text-accent transition-colors"
                        >
                          {event.item.title}
                        </Link>
                      </>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* ---------------------------------------------------------------- */}
      <ConsentPanel lead={lead} basis={basis} role={role} onResult={report} />
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function InterestCard({
  leadId,
  interest,
  categories,
  subcategories,
  tags,
  matches,
  canEmail,
  onResult,
}: {
  leadId: string;
  interest: LeadInterestRow;
  categories: CategoryOption[];
  subcategories: { id: string; name: string; category_id: string }[];
  tags: { id: string; name: string }[];
  matches: MatchingItem[];
  canEmail: boolean;
  onResult: (result: ActionResult) => void;
}) {
  const [description, setDescription] = useState(interest.description);
  const selectedTags = interest.tags.map((t) => t.tag_id);
  // Filtered client-side as the category changes, so switching from Cooking to
  // Refrigeration repopulates the second dropdown without a round trip.
  const options = subcategories.filter((s) => s.category_id === interest.category_id);

  const patch = (next: Parameters<typeof updateInterest>[2]) =>
    updateInterest(leadId, interest.id, next).then(onResult);

  return (
    <div className="bg-background border border-border rounded-xl p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Category">
          <Select
            value={interest.category_id ?? ""}
            onChange={(e) => patch({ category_id: e.target.value || null })}
          >
            <option value="">Not sure</option>
            {byDivision(categories).map((group) => (
              <optgroup key={group.name} label={group.name}>
                {group.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>

        <Field label="Type" hint={interest.category_id ? undefined : "Pick a category first"}>
          <Select
            value={interest.subcategory_id ?? ""}
            disabled={!interest.category_id}
            onChange={(e) => patch({ subcategory_id: e.target.value || null })}
          >
            <option value="">Any</option>
            {options.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Most they will spend" hint="We still tell them about 10% over">
          <RandInput
            valueCents={interest.budget_max_cents}
            onChangeCents={(cents) => patch({ budget_max_cents: cents })}
            placeholder="30 000"
          />
        </Field>

        <Field label="Lowest grade they will take">
          <Select
            value={interest.min_grade ?? ""}
            onChange={(e) =>
              patch({ min_grade: (e.target.value || null) as "N" | "A" | "B" | "C" | null })
            }
          >
            <option value="">Any grade</option>
            {CONDITION_GRADES.map((g) => (
              <option key={g} value={g}>
                {gradeLabel(g)} or better
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-3">
        <Field label="In their words" hint="The matcher reads this too">
          <Textarea
            value={description}
            rows={2}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              if (description === interest.description) return;
              patch({ description });
            }}
            placeholder="Six-burner with an oven under it, gas, opening in Woodstock in March."
          />
        </Field>
      </div>

      {tags.length > 0 && (
        <div className="mt-3">
          <Field label="Must have">
            <ChipGroup
              options={tags.map((t) => ({ value: t.id, label: t.name }))}
              selected={selectedTags}
              onToggle={(id) => {
                const next = selectedTags.includes(id)
                  ? selectedTags.filter((t) => t !== id)
                  : [...selectedTags, id];
                setInterestTags(leadId, interest.id, next).then(onResult);
              }}
            />
          </Field>
        </div>
      )}

      {interest.item && (
        <p className="text-[11px] font-light text-muted mt-3">
          Started from{" "}
          <span className="text-white/70">{interest.item.title}</span> on the website.
        </p>
      )}

      <StockForWant
        leadId={leadId}
        interestId={interest.id}
        canEmail={canEmail}
        matches={matches}
        onResult={onResult}
      />

      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-white/5">
        <button
          type="button"
          onClick={() => fulfilInterest(leadId, interest.id).then(onResult)}
          className="text-[11px] font-light text-muted hover:text-accent transition-colors"
        >
          Found it — stop watching
        </button>
        <span className="text-white/10">·</span>
        <button
          type="button"
          onClick={() => deleteInterest(leadId, interest.id).then(onResult)}
          className="text-[11px] font-light text-muted hover:text-status-sold transition-colors"
        >
          Remove
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function NoteBox({
  leadId,
  onResult,
}: {
  leadId: string;
  onResult: (result: ActionResult) => void;
}) {
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"note" | "call" | "visit">("note");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!body.trim()) return;
    setBusy(true);
    const result = await addEvent(leadId, kind, body);
    setBusy(false);
    if (result.ok) setBody("");
    onResult(result);
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={body}
        rows={2}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Phoned about the fryer. Wants to see it Saturday."
      />
      <div className="flex items-center gap-2 flex-wrap">
        {(["note", "call", "visit"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setKind(option)}
            className={`px-3 py-1.5 rounded-full text-xs font-light border transition-colors ${
              kind === option
                ? "border-accent/70 bg-accent/10 text-accent"
                : "border-border text-white/70 hover:border-white/25"
            }`}
          >
            {LEAD_EVENT_LABELS[option]}
          </button>
        ))}
        <Button
          onClick={submit}
          loading={busy}
          disabled={!body.trim()}
          className="ml-auto text-xs px-4 py-2"
        >
          Log it
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

/**
 * Consent, and the reason we are allowed to write to this person.
 *
 * The `basis` line at the top is the whole point of this panel: "can I put this
 * person in the newsletter" is a question staff will otherwise answer by
 * guessing. Every toggle demands a source, because a consent record that cannot
 * say where it came from is not evidence of anything.
 */
function ConsentPanel({
  lead,
  basis,
  role,
  onResult,
}: {
  lead: LeadRow;
  basis: string | null;
  role: AppRole;
  onResult: (result: ActionResult) => void;
}) {
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = async (channel: "email" | "whatsapp", granted: boolean) => {
    if (granted && !source.trim()) {
      onResult({ ok: false, error: "Say where they agreed — a call, the counter, a form." });
      return;
    }
    setBusy(true);
    onResult(await setConsent(lead.id, channel, granted, source || lead.consent_source || ""));
    setBusy(false);
  };

  return (
    <Panel
      title="May we message them?"
      subtitle="Marketing only. A conversation about something they are already buying is never affected by this."
    >
      <div
        className={`rounded-xl border px-3 py-2.5 text-xs font-light mb-4 ${
          basis
            ? "border-accent/30 bg-accent/10 text-accent"
            : "border-border bg-background text-muted"
        }`}
      >
        {lead.unsubscribed_at
          ? `They opted out on ${new Date(lead.unsubscribed_at).toLocaleDateString("en-ZA")}. Nothing will be sent.`
          : basis
            ? `${basis}${lead.consent_source ? ` — ${lead.consent_source}` : ""}`
            : "No basis to market to them yet. Ask, then record it here."}
      </div>

      {!lead.unsubscribed_at && (
        <>
          <Field
            label="Where did they agree?"
            hint="Required"
          >
            <Input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Asked at the counter, 8 Aug"
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <ConsentToggle
              label="Email about new stock"
              at={lead.email_consent_at}
              missing={!lead.email ? "No email address on file" : null}
              busy={busy}
              onChange={(granted) => toggle("email", granted)}
            />
            <ConsentToggle
              label="WhatsApp about new stock"
              at={lead.whatsapp_consent_at}
              missing={!lead.phone_e164 ? "No usable phone number on file" : null}
              busy={busy}
              onChange={(granted) => toggle("whatsapp", granted)}
            />
          </div>
        </>
      )}

      <div className="mt-5 pt-4 border-t border-white/5">
        {lead.unsubscribed_at ? (
          <ResubscribeBox leadId={lead.id} onResult={onResult} />
        ) : (
          <button
            type="button"
            onClick={async () => onResult(await setUnsubscribed(lead.id, true))}
            className="text-[11px] font-light text-muted hover:text-status-sold transition-colors"
          >
            They asked us to stop — take them off everything
          </button>
        )}
      </div>

      {role === "owner" && (
        <p className="text-[10px] font-light text-muted/60 mt-4 leading-relaxed">
          Their one-click unsubscribe link is /unsubscribe?token={lead.unsubscribe_token}
        </p>
      )}
    </Panel>
  );
}

function ConsentToggle({
  label,
  at,
  missing,
  busy,
  onChange,
}: {
  label: string;
  at: string | null;
  missing: string | null;
  busy: boolean;
  onChange: (granted: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={busy || (!!missing && !at)}
      onClick={() => onChange(!at)}
      className={`text-left rounded-xl border px-3 py-3 transition-colors disabled:opacity-40
                  disabled:cursor-not-allowed ${
                    at
                      ? "border-accent/50 bg-accent/5"
                      : "border-border hover:border-white/25"
                  }`}
    >
      <span className="flex items-center gap-2 text-xs font-medium">
        <span
          className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${
            at ? "bg-accent border-accent text-background" : "border-border"
          }`}
        >
          {at && <iconify-icon icon="solar:check-read-linear" width="9" height="9" noobserver="" />}
        </span>
        {label}
      </span>
      <span className="block text-[11px] font-light text-muted mt-1.5">
        {missing && !at
          ? missing
          : at
            ? `Agreed ${new Date(at).toLocaleDateString("en-ZA")}`
            : "Not asked yet"}
      </span>
    </button>
  );
}

/**
 * Putting somebody back on after they opted out.
 *
 * Needs a note and cannot happen by accident, because reversing an objection is
 * the one consent change a regulator would actually ask about. The database
 * writes its own audit entry either way.
 */
function ResubscribeBox({
  leadId,
  onResult,
}: {
  leadId: string;
  onResult: (result: ActionResult) => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <Field
        label="They asked to go back on the list"
        hint="Who asked, and when"
      >
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Phoned 8 Aug and asked to be added again"
        />
      </Field>
      <Button
        variant="secondary"
        loading={busy}
        disabled={!note.trim()}
        onClick={async () => {
          setBusy(true);
          onResult(await setUnsubscribed(leadId, false, note));
          setBusy(false);
        }}
        className="self-start text-xs px-4 py-2"
      >
        Put them back on
      </Button>
    </div>
  );
}
