"use client";

import { useRef, useState } from "react";
import { Button, Field, Input, Panel, RandInput } from "@takemore/ui";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, REFUND_METHODS, REFUND_METHOD_LABELS,
  planBalance, todaySA, randsExact, type PaymentMethod, type RefundMethod } from "@takemore/core";
import type { OrderDetail } from "@/lib/orders";
import { draftPaymentReminder } from "@/lib/message";
import { recordReceipt } from "../actions";

export default function PaymentLedger({ order, busy, totalCents, embedded = false, onDone }: {
  order: OrderDetail; busy: boolean; totalCents?: number; embedded?: boolean;
  onDone: (result: { ok: boolean; message?: string }) => void;
}) {
  const total = totalCents ?? order.charged_total_cents ?? 0;
  const b = planBalance(order, total, order.receipts);
  const cancelled = order.status === "void";
  const refund = cancelled || b.refundDue > 0;
  const available = refund ? cancelled ? b.received : b.refundDue : b.balance;
  const overdue = !cancelled && (order.sale_plan === "layby" || order.sale_plan === "reservation") && b.overdue > 0;
  const [amount, setAmount] = useState<number | null>(null);
  const [method, setMethod] = useState<PaymentMethod | RefundMethod | "">("");
  const [reference, setReference] = useState(order.lead?.full_name || order.code);
  const [date, setDate] = useState(todaySA());
  const [saving, setSaving] = useState(false);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const inflight = useRef(false);
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  const record = async () => {
    if (inflight.current || !amount || !method) return;
    const fingerprint = JSON.stringify([amount, method, reference, date, refund]);
    if (request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: crypto.randomUUID() };
    inflight.current = true; setSaving(true);
    try {
      const result = await recordReceipt(order.id, { amount, method, reference, date, refund, requestId: request.current.id });
      if (result.ok) { setAmount(null); setMethod(""); request.current = null; }
      onDone({ ok: result.ok, message: result.ok ? result.notice : result.error });
    } catch { onDone({ ok: false, message: "Could not confirm the payment result. Refresh before retrying." }); }
    finally { inflight.current = false; setSaving(false); }
  };
  const copyReminder = async () => {
    try {
      await navigator.clipboard.writeText(draftPaymentReminder({ name: order.lead?.full_name ?? null,
        code: order.code, amount: b.due > 0 ? b.due : b.balance, due: b.next?.date ?? order.plan_final_due }));
      setCopyNote("Reminder copied. Review it before sending to the customer.");
    } catch { setCopyNote("Could not copy the reminder. Please try again."); }
  };
  const body = <div className="space-y-4">
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <div><dt className="text-muted">Total order amount</dt><dd>{randsExact(total)}</dd></div>
      <div><dt className="text-muted">Payments received, less refunds</dt><dd>{randsExact(b.received)}</dd></div>
      <div><dt className="text-muted">{refund ? "Refund still to record" : "Outstanding balance"}</dt><dd>{randsExact(available)}</dd></div>
      {!cancelled && b.balance === 0 && <div><dt className="text-muted">Payment status</dt><dd className="text-accent">Fully paid</dd></div>}
      {!cancelled && b.next && <div><dt className="text-muted">{b.next.label}</dt><dd>{b.next.date}</dd></div>}
    </dl>
    {overdue ? <p role="status" className="text-sm text-status-sold">Overdue · {randsExact(b.overdue)} · due {b.overdueDate}. Check the bank before recording payment.</p>
      : !cancelled && b.due > 0 && <p role="status" className="text-sm text-accent">Payment due · {randsExact(b.due)} · {b.next?.date}</p>}
    {!cancelled && b.balance > 0 && order.plan_confirmed_at && <div className="space-y-2">
      <p className="text-xs text-muted">Staff see payment reminders here and on the Dashboard and Orders screens. Customer reminders are sent by staff.</p>
      <Button variant="secondary" disabled={busy || saving} onClick={copyReminder}>Copy customer payment reminder</Button>
      {copyNote && <p role="status" className="text-xs text-muted">{copyNote}</p>}
    </div>}
    {available > 0 && <div className="space-y-3 border-t border-border pt-4">
      <h3 className="text-sm font-medium">{refund ? "Record a refund already sent" : "Record a payment actually received"}</h3>
      <Field label="Amount" required><RandInput aria-label={refund ? "Refund amount" : "Payment amount"} valueCents={amount} onChangeCents={setAmount} disabled={busy || saving} /></Field>
      <Field label={refund ? "Refund method" : "Payment method"} required>
        <select aria-label={refund ? "Refund method" : "Payment method"} disabled={busy || saving} className="w-full bg-background border border-border rounded-xl p-3 text-sm" value={method} onChange={e => setMethod(e.target.value as PaymentMethod | RefundMethod)}>
          <option value="">Choose {refund ? "refund" : "payment"} method</option>
          {(refund ? REFUND_METHODS : PAYMENT_METHODS).map(m => <option key={m} value={m}>{refund ? REFUND_METHOD_LABELS[m as RefundMethod] : PAYMENT_METHOD_LABELS[m]}</option>)}
        </select>
      </Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Payment date" required><Input aria-label="Payment date" type="date" disabled={busy || saving} value={date} min={order.plan_start ?? order.created_at.slice(0,10)} max={todaySA()} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Payment reference" required><Input aria-label="Payment reference" disabled={busy || saving} value={reference} onChange={e => setReference(e.target.value)} /></Field>
      </div>
      <p className="text-xs text-muted">Customers must use their name and surname as the payment reference. This records money already received or refunded.</p>
      <Button variant="primary" loading={saving} disabled={busy || !amount || amount > available || !method || !reference.trim() || !date} onClick={record}>{refund ? "Record refund" : "Confirm received payment"}</Button>
    </div>}
    {order.receipts.length > 0 && <div className="border-t border-border pt-3"><h3 className="text-sm mb-2">Payment history</h3><ul className="text-xs space-y-2">
      {[...order.receipts].sort((a,b) => a.recorded_at.localeCompare(b.recorded_at)).map(r => <li key={r.id}>{r.received_on} · {r.entry_kind === "refund" ? "Refund " : "Payment "}{randsExact(r.amount_cents)} · {r.entry_kind === "refund" ? REFUND_METHOD_LABELS[r.method as RefundMethod] ?? r.method : PAYMENT_METHOD_LABELS[r.method as PaymentMethod] ?? r.method} · {r.reference}</li>)}
    </ul></div>}
  </div>;
  return embedded ? body : <Panel title="Payments & balance">{body}</Panel>;
}
