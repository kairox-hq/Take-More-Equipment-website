"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Field, Input, Panel, RandInput } from "@takemore/ui";
import { SALE_PLAN_LABELS, orderChargesCents, planDate, reservationDue, todaySA, randsExact as rands } from "@takemore/core";
import type { OrderDetail } from "@/lib/orders";
import { saveSalePlan, voidOrder } from "../actions";

import PaymentLedger from "./PaymentLedger";

type Result = { ok: boolean; message?: string };
export default function SalePlanPanel({ order, listTotal, financeInitialPercent, busy, onDone, onDirty }: {
  order: OrderDetail; listTotal: number; financeInitialPercent?: number; busy: boolean; onDone: (result: Result) => void; onDirty: (dirty: boolean) => void;
}) {
  const plan = order.sale_plan ?? "";
  const [total, setTotal] = useState<number | null>(order.sold_total_cents ?? listTotal);
  const previousList = useRef(listTotal);
  useEffect(() => {
    if (listTotal !== previousList.current && total === previousList.current) setTotal(listTotal);
    previousList.current = listTotal;
  }, [listTotal, total]);
  const [start, setStart] = useState(order.plan_start ?? todaySA());
  const [months, setMonths] = useState(order.plan_months ?? 3);
  const [day, setDay] = useState(order.plan_payment_day ?? Number(start.slice(-2)));
  const [deposit, setDeposit] = useState<number | null>(order.plan_deposit_cents ?? 0);
  const financePercent = financeInitialPercent && financeInitialPercent > 0 && financeInitialPercent < 100 ? financeInitialPercent : null;
  const [depositEdited, setDepositEdited] = useState(order.plan_deposit_cents !== null);
  const [financeDue, setFinanceDue] = useState(order.plan_final_due ?? "");
  const [saving, setSaving] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [returned, setReturned] = useState(false);
  const [reason, setReason] = useState("");
  const inflight = useRef(false);
  const confirmed = Boolean(order.plan_confirmed_at);
  const closed = order.status !== 'draft';
  const charged = (total ?? 0) + orderChargesCents(order);
  const expectedDeposit = plan === 'reservation' ? Math.ceil((total ?? 0) / 2) : plan === 'asset_finance' && financePercent && !depositEdited ? Math.round(charged * financePercent / 100) : deposit ?? 0;
  const finalDue = start ? plan === 'reservation' ? reservationDue(start) : plan === 'layby' ? planDate(start, months, day) : financeDue : '';
  const run = async (action: () => Promise<{ok: true; notice?: string} | {ok: false; error: string}>) => {
    if (inflight.current) return;
    inflight.current = true; setSaving(true);
    try { const result = await action(); if (result.ok) onDirty(false); onDone({ ok: result.ok, message: result.ok ? result.notice : result.error }); }
    catch { onDone({ ok: false, message: 'Could not confirm the result. Refresh before trying again.' }); }
    finally { inflight.current = false; setSaving(false); }
  };
  if (!order.sale_plans_ready) return <Panel title="Sale terms"><p className="text-sm text-muted">The new sale options need the database migration before they can be used. Existing order details remain available.</p></Panel>;
  return <Panel title={plan ? SALE_PLAN_LABELS[plan] + " conditions" : "Purchase conditions"} subtitle="Review the suggested values before confirming the agreement.">
    <div className="space-y-4">
      {!confirmed && !closed ? <>
        {plan && plan !== 'immediate' && <>
          <Field label="Agreed product total" required><RandInput valueCents={total} onChangeCents={setTotal} disabled={saving || busy} /></Field>
          <p className="text-xs text-muted">Total including agreed charges: {rands(charged)}. All items on this order are held together; stock quantities are maintained manually.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Start / deposit date" required><Input type="date" value={start} max={todaySA()} onChange={e => setStart(e.target.value)} disabled={saving || busy} /></Field>
            {plan === 'layby' && <><Field label="Term"><select aria-label="Lay-by term" disabled={busy || saving} className="w-full bg-background border border-border rounded-xl p-3 text-sm" value={months} onChange={e => setMonths(Number(e.target.value))}><option value={2}>2 months</option><option value={3}>3 months</option></select></Field><Field label="Payment day each month"><Input type="number" disabled={busy || saving} min={1} max={31} value={day} onChange={e => setDay(Number(e.target.value))} /></Field></>}
            {plan !== 'reservation' && <Field label="Agreed initial payment" required><RandInput valueCents={expectedDeposit} onChangeCents={value => { setDepositEdited(true); setDeposit(value); }} disabled={saving || busy} /></Field>}
            {plan === 'asset_finance' && <Field label="Agreed final payment due date" required><Input type="date" disabled={busy || saving} min={start} value={financeDue} onChange={e => setFinanceDue(e.target.value)} /></Field>}
          </div>
          <div className="rounded-xl bg-background p-3 text-sm space-y-1">
            <p>Initial payment: {rands(expectedDeposit)}</p>
            <p>Remaining balance: {rands(charged - expectedDeposit)}</p>
            {plan === "asset_finance" && <p>Enter the agreed installation or completion requirement in the order notes. Save an accepted installation charge in Delivery & other charges.</p>}
            {plan === 'layby' && <p>Monthly payment: {rands(Math.ceil((charged - expectedDeposit) / months))} · {months} months</p>}
            <p>Final due: {finalDue || 'Choose a date'}</p>
          </div>
          <p className="text-xs text-muted">{plan === 'layby' ? 'Payments fall on the chosen day, starting next month. Short months use their last day. The final instalment absorbs rounding. Items stay with us until paid in full.' : plan === 'reservation' ? '50% of the product price; the remaining price and any delivery fee are due after seven days. Confirm only the money actually received below. Cancellation keeps the history and any refund due.' : 'Enter the terms agreed with the finance provider. Where payment depends on installation, track completion in the order notes. Money outstanding does not mean installation must wait.'}</p>
        </>}
        <Button variant="primary" loading={saving} disabled={busy || !plan || (plan !== 'immediate' && (!order.lead_id || !total || !start || !finalDue || expectedDeposit < 0 || expectedDeposit >= charged || (plan === 'layby' && (!Number.isInteger(day) || day < 1 || day > 31))))} onClick={() => void run(() => saveSalePlan(order.id, { plan, total: total ?? undefined, start, months, day, deposit: expectedDeposit, due: finalDue || undefined }))}>
          {plan && plan !== 'immediate' ? 'Confirm agreement — no payment recorded yet' : 'Save sale terms'}
        </Button>
      </> : <p className="text-sm text-accent">{order.sale_plan ? SALE_PLAN_LABELS[order.sale_plan] : 'Sale terms not recorded'}</p>}
      {confirmed && <>
        <PaymentLedger order={order} busy={busy || saving} embedded onDone={onDone} />
        {order.status !== 'void' && <div className="border-t border-border pt-3 space-y-3">
          <Button variant="danger" disabled={busy || saving} onClick={()=>setCancel(!cancel)}>Cancel agreement &amp; release items</Button>
          {cancel && <><Field label="Reason" required><Input value={reason} onChange={e=>setReason(e.target.value)} /></Field>{order.status === "paid" && <label className="flex gap-2 text-xs"><input type="checkbox" checked={returned} onChange={e=>setReturned(e.target.checked)} />All items are back in the warehouse and available for sale.</label>}<p className="text-xs text-muted">Release the held items and keep this agreement and all payments. Any money received remains visible as a refund to record. This does not send a refund.</p><Button variant="danger" disabled={busy || !reason.trim() || (order.status === "paid" && !returned)} loading={saving} onClick={()=>void run(()=>voidOrder(order.id,reason))}>Confirm cancellation</Button></>}
        </div>}
      </>}
    </div>
  </Panel>;
}
