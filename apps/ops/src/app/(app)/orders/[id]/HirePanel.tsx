"use client";

import { useEffect, useState } from "react";
import { Button, Field, Input, Panel } from "@takemore/ui";
import {
  HIRE_FULL_RATE_DAYS,
  HIRE_RULE_LABEL,
  hireBreakdown,
  hireDays,
  hireFeeCents,
  randsExact as rands,
} from "@takemore/core";
import { returnHire, setHireDates } from "../actions";
import type { OrderDetail, OrderLineRow } from "@/lib/orders";

/**
 * When the machines go out, when they come back, and what that comes to.
 *
 * The only two things typed here are the dates. Everything under them — the
 * day count, each machine's daily rate, the cheaper rate after the first week,
 * the total — is arithmetic on the asking prices already frozen on the lines,
 * shown live as the dates change and computed again by `confirm_hire_paid()`
 * at the moment of payment, which is the copy that counts.
 *
 * Once paid, the panel becomes the record of the period and the one control
 * that remains: "Mark as returned", which puts every machine back where it was
 * before the order picked it up.
 */
export default function HirePanel({
  order,
  lines,
  locked,
  busy = false,
  onDirty,
  onDone,
}: {
  order: OrderDetail;
  lines: OrderLineRow[];
  locked: boolean;
  /** The screen is between an action and its refresh; nothing may be tapped. */
  busy?: boolean;
  /**
   * Told whenever the typed dates differ from the saved ones. The payment
   * button reads this: confirm_hire_paid() prices the SAVED dates, so a total
   * previewed from unsaved ones is a number the customer would not be charged.
   */
  onDirty?: (dirty: boolean) => void;
  onDone: (result: { ok: boolean; message?: string }) => void;
}) {
  const [start, setStart] = useState(order.hire_start ?? "");
  const [end, setEnd] = useState(order.hire_end ?? "");
  const [saving, setSaving] = useState(false);
  const [returning, setReturning] = useState(false);
  const [confirmingReturn, setConfirmingReturn] = useState(false);

  // Previewed from what is typed, not from what is saved, so the figure moves
  // as the dates do.
  const days = hireDays(start, end);
  const savedDays = hireDays(order.hire_start, order.hire_end);
  const total = days ? lines.reduce((sum, l) => sum + hireFeeCents(l.list_price_cents, days), 0) : 0;
  const dirty = !locked && (start !== (order.hire_start ?? "") || end !== (order.hire_end ?? ""));
  const wrongWayRound = start !== "" && end !== "" && days === null;

  useEffect(() => {
    onDirty?.(dirty);
  }, [dirty, onDirty]);

  const save = async () => {
    setSaving(true);
    const result = await setHireDates(order.id, { start: start || null, end: end || null });
    setSaving(false);
    onDone(result.ok ? { ok: true } : { ok: false, message: result.error });
  };

  const back = async () => {
    setReturning(true);
    const result = await returnHire(order.id);
    setReturning(false);
    if (result.ok) setConfirmingReturn(false);
    onDone(result.ok ? { ok: true, message: result.notice } : { ok: false, message: result.error });
  };

  if (locked) {
    const paid = order.status === "paid";
    const returned = Boolean(order.hire_returned_at);

    return (
      <Panel
        title="Hire period"
        subtitle={
          savedDays
            ? `${savedDays} day${savedDays === 1 ? "" : "s"}, both days included`
            : undefined
        }
      >
        <div className="space-y-3">
          <p className="text-sm font-light text-white/90">
            {longDay(order.hire_start)} to {longDay(order.hire_end)}
          </p>

          {savedDays && <div className="space-y-2 text-sm border-t border-border pt-3">
            {lines.map(line => { const b = hireBreakdown(line.list_price_cents, savedDays); return <p key={line.id}>
              <span className="font-mono">{line.item?.sku}</span> · {b.fullDays} × {rands(b.dailyCents)}
              {b.discountedDays > 0 ? ` + ${b.discountedDays} × ${rands(b.discountedCents)}` : ""} = {rands(b.totalCents)}
            </p>; })}
          </div>}
          {paid && (
            <div className="border-t border-white/5 pt-3 space-y-2">
              {returned ? (
                <p className="text-[11px] font-light text-muted">
                  Returned{" "}
                  {new Date(order.hire_returned_at as string).toLocaleString("en-ZA", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  . The machines are back in stock.
                </p>
              ) : (
                <>
                  <p className="text-[11px] font-light text-muted">
                    Out on hire. The website shows “Coming back soon”; these machines cannot be bought until they return.
                  </p>
                  {!confirmingReturn ? (
                    <Button variant="secondary" disabled={busy} onClick={() => setConfirmingReturn(true)}>
                      Mark as returned
                    </Button>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[11px] font-light text-muted">
                        The machines go back into stock and back onto the website. The money stays
                        recorded.
                      </p>
                      <div className="flex gap-2">
                        <Button variant="primary" loading={returning} disabled={busy} onClick={back}>
                          Yes, they are back
                        </Button>
                        <Button variant="ghost" onClick={() => setConfirmingReturn(false)}>
                          Not yet
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Hire period" subtitle={HIRE_RULE_LABEL}>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Goes out on">
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field
            label="Comes back on"
            hint={
              wrongWayRound
                ? "before it goes out"
                : days
                  ? `${days} day${days === 1 ? "" : "s"}`
                  : undefined
            }
            error={wrongWayRound ? "The return date is before the start date." : undefined}
          >
            <Input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>

        {days && lines.length > 0 ? (
          <dl className="space-y-1.5 text-sm border-t border-white/5 pt-3">
            {lines.map((line) => {
              const b = hireBreakdown(line.list_price_cents, days);
              return (
                <div key={line.id} className="flex items-baseline justify-between gap-3">
                  <dt className="text-xs font-light text-muted min-w-0 truncate">
                    <span className="font-mono tracking-widest">{line.item?.sku}</span>
                    {" · "}
                    {b.fullDays} × {rands(b.dailyCents)}
                    {b.discountedDays > 0
                      ? ` + ${b.discountedDays} × ${rands(b.discountedCents)}`
                      : ""}
                  </dt>
                  <dd className="text-sm font-light tabular-nums text-white/90 shrink-0">
                    {rands(b.totalCents)}
                  </dd>
                </div>
              );
            })}
            <div className="flex items-baseline justify-between gap-3 pt-1">
              <dt className="text-xs font-light text-white/80">
                Hire, {days} day{days === 1 ? "" : "s"}
              </dt>
              <dd className="text-base font-medium tabular-nums text-accent">{rands(total)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-[11px] font-light text-muted">
            {lines.length === 0
              ? "Add the machines and the dates, and the price works itself out."
              : `Pick both dates. The first ${HIRE_FULL_RATE_DAYS} days are at the full daily rate.`}
          </p>
        )}

        <Button variant="primary" loading={saving} disabled={busy || !dirty || wrongWayRound} onClick={save}>
          Save dates
        </Button>
        {dirty && !wrongWayRound && (
          <p className="text-[11px] font-light text-muted">
            The figure above is for the dates as typed. Save them before recording the payment —
            the payment is priced on what is saved.
          </p>
        )}
      </div>
    </Panel>
  );
}

/** `1 September 2026`, from a `2026-09-01` calendar day. */
function longDay(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
