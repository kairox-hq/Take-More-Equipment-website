"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Panel, RandInput } from "@takemore/ui";
import {
  PAYMENT_METHODS,
  orderChargesCents,
  planBalance,
  PAYMENT_METHOD_LABELS,
  discountCents,
  discountPercent,
  orderEconomics,
  randsExact as rands,
  type PaymentMethod,
} from "@takemore/core";
import {
  confirmHirePaid,
  confirmPaid,
  discardOrder,
  reopenOrder,
  setProvisionalTotal,
  voidOrder,
} from "../actions";
import type { OrderDetail } from "@/lib/orders";

/**
 * The number, and where the money came from.
 *
 * This is the point of the whole screen. The salesperson types what was
 * actually agreed — which is usually not the asking price, because they have
 * been negotiating — and everything they need to judge that number is already
 * on the page above: what we are asking, what it cost us, what it would cost
 * new. What this panel adds is the arithmetic, live, as the figure is typed:
 * how much was given away, and what is left.
 *
 * Neither payment option moves money. The card machine and the bank do that.
 * This records which of them it was, so the day's takings can be reconciled.
 */
export default function PaymentPanel({
  order,
  listTotalCents,
  costTotalCents,
  showCosts,
  canReopen,
  hire,
  busy = false,
  track,
  beforeConfirm,
  onDone,
}: {
  order: OrderDetail;
  listTotalCents: number;
  costTotalCents: number | null;
  showCosts: boolean;
  canReopen: boolean;
  /**
   * Null on a sale. On a rental the total is not typed — it is computed from
   * the saved dates and the asking prices, and this is that figure, previewed
   * here and written by confirm_hire_paid() from the same rule.
   */
  hire: { days: number | null; totalCents: number; returned: boolean; dirty: boolean } | null;
  /** The screen is between an action and its refresh; nothing may be tapped. */
  busy?: boolean;
  /** Registers a blur-save with the screen so the payment can wait for it. */
  track?: (save: Promise<unknown>) => void;
  /**
   * Awaited before the payment RPC is called. The screen blurs whatever has
   * focus — the note, this panel's own price box — and waits for the saves
   * that fires, so nothing typed a second ago is refused by RLS a second later
   * because the order is already paid.
   */
  beforeConfirm?: () => Promise<void>;
  onDone: (result: { ok: boolean; message?: string }) => void;
}) {
  const [cents, setCents] = useState<number | null>(order.sold_total_cents ?? listTotalCents);
  /**
   * No default. "Card machine" pre-selected meant a bank transfer recorded as
   * a card payment by anybody who did not look, and the day's reconciliation
   * is the first place that shows up.
   */
  const [method, setMethod] = useState<PaymentMethod | null>(order.purchase_option === "payjustnow" ? "payjustnow" : order.payment_method ?? null);
  const [reference, setReference] = useState(order.payment_reference ?? "");
  const [saving, setSaving] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmingVoid, setConfirmingVoid] = useState(false);
  const router = useRouter();

  const paid = order.status === "paid";
  const outstanding = planBalance(order, order.charged_total_cents ?? 0, order.receipts).balance;
  const cancelled = order.status === "void";
  /**
   * An order nobody finished.
   *
   * It has to be closable, and until now it was not: the only way out of the
   * till was through a payment. A customer who walks away left an order open for
   * ever, holding its machines `reserved` and off the website, and the orders
   * list counted it as still on the counter.
   *
   * What it does depends on whether money was ever recorded, and that is the
   * whole rule:
   *
   *   never paid       →  discarded. Nothing is kept, because nothing happened.
   *   paid, or paid
   *   and reopened     →  cancelled, with a reason, kept for ever.
   *
   * `sold_by` is what tells them apart: confirm_order_paid() writes it and
   * reopen_order() deliberately does not clear it, so a draft that carries one
   * is a sale being corrected rather than a sale that never was.
   */
  const open = !paid && !cancelled;
  const everPaid = Boolean(order.sold_by);
  /** True when closing this order means deleting it rather than voiding it. */
  const discards = open && !everPaid;

  const goods = paid ? (order.sold_total_cents ?? 0) : hire ? hire.totalCents : (cents ?? 0);
  const charged = goods + orderChargesCents(order);
  const off = hire ? null : discountCents(listTotalCents, cents);
  const offPercent = hire ? null : discountPercent(listTotalCents, cents);
  /**
   * A rental's total is ready when the dates are saved and something on the
   * order has a price. Nothing is typed, so there is nothing else to wait for.
   */
  const hireReady = hire !== null && Boolean(hire.days) && hire.totalCents > 0 && !hire.dirty;
  /** Everything the button needs before it may be pressed. */
  const canConfirm =
    (hire ? hireReady : Boolean(cents) && (cents as number) > 0) &&
    Boolean(order.lead_id) &&
    method !== null && (Boolean(hire) || (order.sale_plans_ready && order.sale_plan === "immediate"));
  /**
   * Everything in, everything out, and the share we keep.
   *
   * The delivery fee counts as income AND as cost, because that is what it is:
   * the customer pays it and a driver takes it. It therefore cancels out of the
   * rand margin — which is why this number still matches the one on the reports
   * — while correctly diluting the percentage, since money passing straight
   * through us is takings we keep nothing of.
   */
  /**
   * Not on a rental. The cost of a machine is spent when it is SOLD; a hire
   * earns against a machine that is still on the shelf afterwards, and
   * subtracting its whole cost from one weekend's fee would report every
   * rental as a loss. What a hire earns over a machine's life is a dashboard
   * question, and not one this screen can answer.
   */
  const economics =
    costTotalCents === null || hire
      ? null
      : orderEconomics(goods, orderChargesCents(order), costTotalCents);
  const margin = economics?.marginCents ?? null;
  const belowCost = margin !== null && margin < 0;

  const confirm = async () => {
    if (!canConfirm || method === null) return;
    setSaving(true);
    // Let the note and the price box finish saving first — see beforeConfirm.
    await beforeConfirm?.();
    const result = hire
      ? await confirmHirePaid(order.id, method, reference)
      : await confirmPaid(order.id, cents as number, method, reference);
    setSaving(false);
    onDone(result.ok ? { ok: true, message: result.notice } : { ok: false, message: result.error });
  };

  const cancel = async () => {
    setVoiding(true);
    const result = discards ? await discardOrder(order.id) : await voidOrder(order.id, reason);
    setVoiding(false);
    if (result.ok) {
      setConfirmingVoid(false);
      setReason("");
      // A discarded order has no page to go back to. Pushed rather than
      // refreshed, because refreshing would land on a 404 for a row this very
      // click removed.
      if (discards) {
        router.push("/orders");
        router.refresh();
        return;
      }
    }
    onDone(result.ok ? { ok: true, message: result.notice } : { ok: false, message: result.error });
  };

  const reopen = async () => {
    setSaving(true);
    const result = await reopenOrder(order.id);
    setSaving(false);
    onDone(result.ok ? { ok: true, message: result.notice } : { ok: false, message: result.error });
  };

  return (
    <Panel
      title={paid ? outstanding > 0 && order.charges_ready ? "Payment recorded — balance due" : "Fully paid" : cancelled ? "Cancelled" : hire ? "What the hire comes to" : "Price & payment"}
      subtitle={
        cancelled
          ? (order.void_reason ?? undefined)
          : paid
            ? undefined
            : hire
              ? "Worked out from the dates and the asking prices. Nothing to type."
              : "The real number, after whatever you agreed."
      }
    >
      <div className="space-y-3">
        {!paid && !cancelled && !hire && (
          <Field label="Price agreed for the machines">
            <RandInput
              valueCents={cents}
              onChangeCents={setCents}
              // Saved on blur so a salesperson called away mid-conversation
              // comes back to the figure rather than an empty box. A draft is
              // allowed to carry a goods total; it is the payment fields that
              // it may not carry.
              onBlur={() => {
                if (cents === order.sold_total_cents) return;
                const saving = setProvisionalTotal(order.id, cents);
                track?.(saving);
                void saving;
              }}
              disabled={busy}
              placeholder="0"
            />
          </Field>
        )}

        {/* The arithmetic. Asking, discount, delivery, and what they hand over. */}
        <dl className="space-y-1.5 text-sm border-t border-white/5 pt-3">
          {hire ? (
            <Row
              label={hire.days ? `Hire, ${hire.days} day${hire.days === 1 ? "" : "s"}` : "Hire"}
              value={hire.days ? rands(goods) : "pick the dates"}
              muted
            />
          ) : (
            <Row label="Asking" value={rands(listTotalCents)} muted />
          )}
          {off !== null && off !== 0 && (
            <Row
              label={off > 0 ? `Discount (${offPercent}%)` : "Above asking"}
              value={`${off > 0 ? "−" : "+"}${rands(Math.abs(off))}`}
              muted
            />
          )}
          {order.delivery && (
            <Row label="Delivery" value={rands(order.delivery_fee_cents)} muted />
          )}
          {order.installation_accepted && !!order.installation_quote_cents && <Row label="Installation" value={rands(order.installation_quote_cents)} muted />}
          <Row label="Customer pays" value={rands(charged)} strong />
        </dl>

        {showCosts && costTotalCents !== null && !hire && (
          <dl
            className={`space-y-1.5 text-sm border rounded-xl px-3 py-2.5 ${
              belowCost
                ? "border-status-sold/30 bg-status-sold/5"
                : "border-white/5 bg-background"
            }`}
          >
            <Row label="What the machines cost us" value={rands(costTotalCents)} muted />
            {/* Only when there is one. An order collected from the warehouse
                has no delivery on either side, and two extra rows reading R0
                would be noise on the screen this business uses most. */}
            {economics !== null && economics.deliveryCostCents > 0 && (
              <>
                <Row
                  label="Service costs assumed equal to charges"
                  value={rands(economics.deliveryCostCents)}
                  muted
                />
                <Row label="Total cost" value={rands(economics.costCents)} muted />
              </>
            )}
            <Row
              label={belowCost ? "Loss" : "Margin"}
              value={rands(Math.abs(margin ?? 0))}
              // The percentage is of everything the customer hands over, not of
              // the machines alone, so it answers "how much of the takings do we
              // keep" rather than "how much of the sticker".
              note={
                economics?.percent === null || economics === null
                  ? undefined
                  : `${Math.abs(economics.percent)}% of takings`
              }
              strong
              tone={belowCost ? "bad" : "good"}
            />
          </dl>
        )}

        {!paid && !cancelled && (
          <>
            <Field label="How did they pay?">
              <div className="flex flex-wrap gap-2">
                {PAYMENT_METHODS.filter(m => order.purchase_option === "payjustnow" ? m === "payjustnow" : m !== "payjustnow").map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    disabled={busy}
                    className={`px-3 py-1.5 rounded-full text-xs font-light border transition-colors disabled:opacity-40 ${
                      method === m
                        ? "border-accent/70 bg-accent/10 text-accent"
                        : "border-border text-white/70 hover:border-white/25"
                    }`}
                  >
                    {PAYMENT_METHOD_LABELS[m]}
                  </button>
                ))}
              </div>
            </Field>

            <Field
              label="Reference"
              hint="optional"
            >
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                disabled={busy}
                placeholder={
                  method === "card_machine"
                    ? "Slip number"
                    : method === "bank_transfer"
                      ? "EFT reference"
                      : "Slip number or EFT reference"
                }
              />
            </Field>

            <p className="text-[11px] font-light text-muted">
              Only tick this once the money is actually there — the slip printed, or
              the transfer showing in the account.
            </p>

            <Button
              variant="primary"
              loading={saving}
              disabled={busy || !canConfirm}
              onClick={confirm}
              className="w-full"
            >
              {!order.lead_id
                ? "Add a customer first"
                : hire && (!hire.days || hire.dirty)
                  ? "Save the hire dates first"
                  : hire && !hireReady
                    ? "Add a priced machine first"
                    : !hire && (!cents || cents <= 0)
                      ? "Type what it sold for first"
                      : !hire && order.sale_plan !== "immediate"
                        ? "Choose and save the sale terms first"
                      : method === null
                        ? "Choose how they paid first"
                        : "Record the payment"}
            </Button>
          </>
        )}

        {(paid || open) && (
          <div className="space-y-3 border-t border-white/5 pt-3">
            <p className="text-[11px] font-light text-muted">
              {[
                paid && order.payment_method ? PAYMENT_METHOD_LABELS[order.payment_method] : null,
                order.payment_reference,
                order.paid_at
                  ? new Date(order.paid_at).toLocaleString("en-ZA", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>

            <div className="flex flex-wrap gap-2">
              {/* A returned hire is finished: its machines are back in stock
                  and reopening it would re-hold them for dates that have
                  passed. Cancelling stays available, because the money can
                  still have been wrong. */}
              {paid && canReopen && !hire?.returned && (
                <Button variant="secondary" loading={saving} disabled={busy} onClick={reopen}>
                  {hire ? "Reopen to change the dates" : "Correct the amount"}
                </Button>
              )}
              <Button variant="danger" disabled={busy} onClick={() => setConfirmingVoid((v) => !v)}>
                {discards ? "Discard this order" : "Cancel this sale"}
              </Button>
            </div>

            {confirmingVoid && (
              <div className="space-y-2">
                {/* A discard asks for no reason.
                    Nothing was sold, so there is nothing to explain to anybody
                    later — and a required box in front of an undo is how a
                    salesperson learns to leave the mess instead. A cancellation
                    is the opposite: it unwinds money that was recorded, and the
                    reason is the whole value of the record it leaves behind. */}
                {!discards && (
                  <Field label="Why?">
                    <Input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="The finance fell through"
                    />
                  </Field>
                )}
                <p className="text-[11px] font-light text-muted">
                  {discards
                    ? "Nothing was sold, so this order will not be kept at all. Any machine held for it goes back into stock and back onto the website."
                    : "The machines go back into stock and back onto the website, and the money comes off the reports."}
                </p>
                <Button
                  variant="danger"
                  loading={voiding}
                  disabled={busy || (!discards && !reason.trim())}
                  onClick={cancel}
                >
                  {discards ? "Discard" : "Cancel"} {order.code}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}

function Row({
  label,
  value,
  note,
  muted,
  strong,
  tone,
}: {
  label: string;
  value: string;
  /** Second line under the figure — the percentage beside the margin. */
  note?: string;
  muted?: boolean;
  strong?: boolean;
  tone?: "good" | "bad";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={`text-xs font-light ${muted ? "text-muted" : "text-white/80"}`}>
        {label}
      </dt>
      <dd
        className={`text-right tabular-nums ${
          strong ? "text-base font-medium" : "text-sm font-light"
        } ${
          tone === "bad" ? "text-status-sold" : tone === "good" ? "text-accent" : "text-white/90"
        }`}
      >
        {value}
        {note && (
          <span className="block text-[11px] font-light text-muted">{note}</span>
        )}
      </dd>
    </div>
  );
}
