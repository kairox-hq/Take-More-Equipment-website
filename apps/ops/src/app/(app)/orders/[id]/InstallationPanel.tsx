"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Field, Panel, RandInput } from "@takemore/ui";
import { randsExact } from "@takemore/core";
import type { OrderDetail } from "@/lib/orders";
import { setInstallation } from "../actions";

export default function InstallationPanel({ order, busy, onDirty, onDone }: {
  order: OrderDetail;
  busy: boolean;
  onDirty: (dirty: boolean) => void;
  onDone: (result: { ok: boolean; message?: string }) => void;
}) {
  const [quote, setQuote] = useState<number | null>(order.installation_quote_cents ?? null);
  const [accepted, setAccepted] = useState(Boolean(order.installation_accepted));
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const locked = order.status === "void" || !order.charges_ready;
  const dirty = !locked && (quote !== (order.installation_quote_cents ?? null)
    || accepted !== Boolean(order.installation_accepted));
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  const save = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    try {
      const result = await setInstallation(order.id, { quote, accepted });
      onDone({ ok: result.ok, message: result.ok ? result.notice : result.error });
    } catch {
      onDone({ ok: false, message: "Could not confirm the installation quote. Refresh before trying again." });
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };
  return <Panel title="Installation quote" subtitle="Only an accepted installation charged through Take More is included in the order total.">
    <div className="space-y-4">
      {locked ? <p className="text-sm text-muted">
        {quote == null ? "No installation quote recorded." : `${randsExact(quote)} · ${accepted ? "accepted and charged" : "not charged"}`}
      </p> : <>
        <Field label="Optional installation quote">
          <RandInput aria-label="Optional installation quote" valueCents={quote} onChangeCents={setQuote} disabled={busy || saving} />
        </Field>
        <label className="flex gap-2 text-sm">
          <input type="checkbox" disabled={busy || saving} checked={accepted} onChange={event => setAccepted(event.target.checked)} />
          Installation accepted — charge through Take More
        </label>
        <p className="text-sm">Installation included in total: {randsExact(accepted ? quote ?? 0 : 0)}</p>
        <Button variant="primary" loading={saving} disabled={busy || !dirty || accepted && quote == null} onClick={save}>Save installation</Button>
        {dirty && <p className="text-xs text-muted">Save the installation quote before confirming the agreement or recording payment.</p>}
      </>}
    </div>
  </Panel>;
}
