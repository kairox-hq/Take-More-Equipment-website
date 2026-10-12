"use client";

import { useCallback, useState } from "react";
import { createBrowserClient } from "@takemore/db";
import { Button, Field, Input, Panel } from "@takemore/ui";
import { CUSTOMER_SOURCES, LEAD_SOURCE_LABELS, type LeadSource, formatPhone, normalisePhone } from "@takemore/core";
import { useLiveSearch } from "@/lib/useLiveSearch";
import { createOrderCustomer, setOrderCustomer } from "../actions";
import type { OrderDetail } from "@/lib/orders";

type Hit = { id: string; title: string; subtitle: string | null };

/**
 * Who is buying.
 *
 * Two ways in, because there are two kinds of customer standing at a counter:
 * one we have met and one we have not. Searching reuses search_everything —
 * already ranked, already matching on the last digits of a phone number, which
 * is how somebody is actually identified when they walk in.
 *
 * Capturing a new one recovers from a duplicate rather than erroring on it: a
 * phone number that already exists means this is a returning customer, and
 * attaching the sale to the person we already have is the right answer.
 */
export default function CustomerPicker({
  order,
  locked,
  onDone,
}: {
  order: OrderDetail;
  locked: boolean;
  onDone: (result: { ok: boolean; message?: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ full_name: "", phone: "", email: "", business_name: "", source: "walk_in" as LeadSource });

  const fetcher = useCallback(async (term: string): Promise<Hit[]> => {
    const client = createBrowserClient();
    const { data } = await client.rpc("search_everything", { p_query: term, p_limit: 8 });
    return ((data ?? []) as { kind: string; id: string; title: string; subtitle: string | null }[])
      .filter((row) => row.kind === "lead")
      .map(({ id, title, subtitle }) => ({ id, title, subtitle }));
  }, []);

  const { hits, loading, tooShort } = useLiveSearch<Hit>(query, fetcher);

  const attach = async (leadId: string | null) => {
    setSaving(true);
    const result = await setOrderCustomer(order.id, leadId);
    setSaving(false);
    setQuery("");
    onDone(result.ok ? { ok: true } : { ok: false, message: result.error });
  };

  const capture = async () => {
    setSaving(true);
    const result = await createOrderCustomer(order.id, form);
    setSaving(false);
    if (result.ok) {
      setCapturing(false);
      setForm({ full_name: "", phone: "", email: "", business_name: "", source: "walk_in" as LeadSource });
    }
    onDone(result.ok ? { ok: true, message: result.notice } : { ok: false, message: result.error });
  };

  // Already chosen. Shown as a fact with a way to change it, rather than as a
  // search box that has to be re-answered every time the page loads.
  if (order.lead) {
    const name =
      order.lead.full_name?.trim() || order.lead.business_name?.trim() || "Someone";
    return (
      <Panel title="2. Customer">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium tracking-tight truncate">{name}</p>
            <p className="text-[11px] font-light text-muted truncate">
              {[
                order.lead.business_name?.trim() && order.lead.business_name !== name
                  ? order.lead.business_name
                  : null,
                order.lead.phone ? formatPhone(order.lead.phone) : null,
                order.lead.email,
              ]
                .filter(Boolean)
                .join(" · ") || "No contact details"}
            </p>
          </div>
          {!locked && (
            <Button
              variant="ghost"
              loading={saving}
              // null, not "" — an empty string is not a uuid, and Postgres
              // would refuse it with a message about syntax rather than
              // detaching anybody.
              onClick={() => attach(null)}
              className="shrink-0"
            >
              Change
            </Button>
          )}
        </div>
      </Panel>
    );
  }

  if (locked) {
    return (
      <Panel title="2. Customer">
        <p className="text-sm font-light text-muted">Nobody was recorded on this order.</p>
      </Panel>
    );
  }

  return (
    <Panel
      title="2. Customer"
      subtitle="Search for them, or take their details."
      actions={
        <Button variant="ghost" onClick={() => setCapturing((v) => !v)}>
          {capturing ? "Search instead" : "New customer"}
        </Button>
      }
    >
      {capturing ? (
        <div className="space-y-3">
          <Field label="Name">
            <Input
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              placeholder="Who is buying"
            />
          </Field>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field
              label="Phone"
              // Advisory, never a blocker — the database's only floor is an
              // email address or a phone number, and half a number typed while
              // somebody reads it out is a normal intermediate state.
              hint={
                form.phone
                  ? normalisePhone(form.phone)
                    ? formatPhone(normalisePhone(form.phone))
                    : "Not a full number"
                  : undefined
              }
            >
              <Input
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="082 123 4567"
                inputMode="tel"
              />
            </Field>

            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="them@example.co.za"
              />
            </Field>
          </div>

          <Field label="Business">
            <Input
              value={form.business_name}
              onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
              placeholder="The restaurant, if there is one"
            />
          </Field>

          <Field label="How did they reach us?">
            <select aria-label="How did they reach us?" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value as LeadSource }))}
              className="w-full bg-background border border-border rounded-xl p-3 text-sm">
              {CUSTOMER_SOURCES.map(source => <option key={source} value={source}>{LEAD_SOURCE_LABELS[source]}</option>)}
            </select>
          </Field>
          <Button
            variant="primary"
            loading={saving}
            disabled={!form.phone.trim() && !form.email.trim()}
            onClick={capture}
          >
            Save and attach
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <iconify-icon
              icon="solar:magnifer-linear"
              width="16"
              height="16"
              noobserver=""
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, business, or the last digits of their number"
              className="w-full bg-card border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm font-light
                         text-white/90 placeholder:text-muted/60 hover:border-white/20
                         focus:border-accent focus:outline-none transition-colors"
            />
          </div>

          {tooShort ? (
            <p className="text-[11px] font-light text-muted">Type at least two characters.</p>
          ) : hits.length === 0 && !loading ? (
            <p className="text-[11px] font-light text-muted">
              Nobody matches that. Take their details instead.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {hits.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => attach(hit.id)}
                    className="w-full text-left bg-background border border-border rounded-xl px-3 py-2.5
                               hover:border-white/25 transition-colors disabled:opacity-50"
                  >
                    <p className="text-sm font-light text-white/90 truncate">{hit.title}</p>
                    {hit.subtitle && (
                      <p className="text-[11px] text-muted truncate">{hit.subtitle}</p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Panel>
  );
}
