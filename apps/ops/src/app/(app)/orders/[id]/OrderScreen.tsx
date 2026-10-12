"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Panel } from "@takemore/ui";
import { StatusPill } from "@takemore/ui";
import {
  PURCHASE_OPTIONS,
  PURCHASE_OPTION_LABELS,
  purchaseOption,
  ORDER_STATUS_LABELS,
  orderChargesCents,
  planBalance,
  allocateSoldTotal,
  canReopenSale,
  canSeeCosts,
  hireDailyRateCents,
  hireDays,
  hireFeeCents,
  randsExact as rands,
  type AppRole,
  type PurchaseOption,
  type OrderStatus,
} from "@takemore/core";
import ItemThumb from "@/components/ItemThumb";
import type {
  OrderDetail,
  OrderEconomics,
  OrderInvoiceRow,
  OrderLineCost,
  OrderLineRow,
} from "@/lib/orders";
import CustomerPicker from "./CustomerPicker";
import ProductPicker from "./ProductPicker";
import DeliveryPanel from "./DeliveryPanel";
import InstallationPanel from "./InstallationPanel";
import HirePanel from "./HirePanel";
import SalePlanPanel from "./SalePlanPanel";
import PaymentPanel from "./PaymentPanel";
import PaymentLedger from "./PaymentLedger";
import NotesPanel from "./NotesPanel";
import InvoicePanel from "./InvoicePanel";
import { removeLine, choosePurchaseOption, discardOrder } from "../actions";

const STATUS_CHROME: Record<OrderStatus, string> = {
  draft: "border-accent/40 text-accent",
  paid: "border-status-ready/40 text-status-ready",
  void: "border-border text-muted",
};

/**
 * The till.
 *
 * One page: products, customer, purchase option, conditions, delivery and payment. Nothing is a wizard — a customer
 * changes their mind about a machine after the delivery address has been taken,
 * and a screen that made you go back would be a screen people worked around.
 *
 * A paid or cancelled order renders the same layout with every control gone.
 * The record and the workspace are the same page on purpose: "what did we do
 * for this person" and "what are we doing for this person" are the same
 * question a week apart.
 */
export default function OrderScreen({
  order,
  lines,
  economics,
  lineCosts,
  invoices,
  invoicing,
  role,
  financeInitialPercent,
}: {
  order: OrderDetail;
  lines: OrderLineRow[];
  economics: OrderEconomics | null;
  lineCosts: OrderLineCost[];
  invoices: OrderInvoiceRow[];
  invoicing: { ok: boolean; error?: string; bank: boolean };
  role: AppRole;
  financeInitialPercent?: number;
}) {
  const router = useRouter();
  /**
   * Keep controls disabled while action feedback and the updated page settle — otherwise the trash
   * button re-enables on stale data and a second tap acts on an order the
   * screen no longer describes.
   */
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  /** Hire dates typed but not yet saved. The pay button waits for them. */
  const [planDirty, setPlanDirty] = useState(false);
  const [chargesDirty, setChargesDirty] = useState(false);
  const [hireDirty, setHireDirty] = useState(false);

  /**
   * Saves that happen on blur — the note, the provisional total — and are
   * therefore still in flight when somebody taps "Record the payment" straight
   * out of the box. The payment RPC would commit first and the note's update
   * would then be refused by RLS, silently, and the note lost. So the panels
   * register those promises here and the payment waits for them.
   */
  const pending = useRef(new Set<Promise<unknown>>());
  const track = useCallback((save: Promise<unknown>) => {
    pending.current.add(save);
    void save.finally(() => pending.current.delete(save));
  }, []);
  const flush = useCallback(async () => {
    // Whatever has focus is told to let go, which fires its onBlur save…
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    // …on the next tick, after which it is in the set and can be waited for.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.allSettled([...pending.current]);
  }, []);

  const busy = isPending || switching || removing !== null;
  const locked = order.status !== "draft" || Boolean(order.plan_confirmed_at);
  const hire = order.kind === "hire";
  /**
   * The number of days the hire is priced on, from the SAVED dates — the
   * figures on this screen must agree with what confirm_hire_paid() is about to
   * write, and it reads the row, not the boxes.
   */
  const days = hire ? hireDays(order.hire_start, order.hire_end) : null;
  const hireTotal = days ? lines.reduce((sum, l) => sum + hireFeeCents(l.list_price_cents, days), 0) : 0;
  const showCosts = canSeeCosts(role) && economics !== null;

  const costByItem = new Map(lineCosts.map((c) => [c.item_id, c]));

  const listTotal = lines.reduce((sum, line) => sum + line.list_price_cents, 0);
  const chargedTotal = (hire && order.status === "draft" ? hireTotal : order.sold_total_cents ?? listTotal) + orderChargesCents(order);
  const balance = planBalance(order, chargedTotal, order.receipts);
  const retailTotal = lines.reduce((sum, line) => sum + (line.retail_price_cents ?? 0), 0);
  const costTotal = showCosts ? (economics?.cost_total_cents ?? 0) : null;

  /**
   * What each machine will be recorded as having sold for, previewed.
   *
   * The same split confirm_order_paid() will perform, over the same lines in
   * the same order — which is why getOrderLines sorts by position then id. If
   * this disagreed with the database the screen would show one machine a few
   * cents different from what was about to be written, and the salesperson
   * would be the one who found out.
   */
  const preview =
    !locked && !hire && order.sold_total_cents
      ? allocateSoldTotal(
          order.sold_total_cents,
          lines.map((l) => l.list_price_cents)
        )
      : null;

  const handled = (result: { ok: boolean; message?: string }) => {
    // Each action revalidates this route and returns its updated server payload.
    // A second refresh can abort that response while its transition is pending.
    startTransition(() => {
      setError(result.ok ? null : (result.message ?? "That did not work."));
      setNotice(result.ok ? (result.message ?? null) : null);
    });
  };

  const option = purchaseOption(order);
  const switchOption = async (next: PurchaseOption) => {
    if (next === option) return;
    setSwitching(true);
    try {
      await flush();
      const result = await choosePurchaseOption(order.id, next);
      if (result.ok) { setPlanDirty(false); setHireDirty(false); }
      handled(result.ok ? { ok: true } : { ok: false, message: result.error });
    } catch { handled({ ok: false, message: 'Could not save the purchase option. Refresh and try again.' }); }
    finally { setSwitching(false); }
  };

  const discard = async () => {
    if (!window.confirm('Discard this draft and release its items?')) return;
    setSwitching(true);
    try {
      const result = await discardOrder(order.id);
      if (result.ok) { router.push('/orders'); router.refresh(); }
      else handled({ ok: false, message: result.error });
    } finally { setSwitching(false); }
  };

  const drop = async (itemId: string) => {
    setRemoving(itemId);
    const result = await removeLine(order.id, itemId);
    setRemoving(null);
    handled(result.ok ? { ok: true, message: result.notice } : { ok: false, message: result.error });
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-medium tracking-tight font-mono tracking-widest">
            {order.code}
          </h1>
          <p className="text-xs font-light text-muted mt-1">
            opened{" "}
            {new Date(order.created_at).toLocaleDateString("en-ZA", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hire && (
            <span className="px-2.5 py-1 rounded-full text-[11px] font-light border border-white/15 text-white/80">
              {order.hire_returned_at
                ? "Rental · returned"
                : order.status === "paid"
                  ? "Rental · out"
                  : "Rental"}
            </span>
          )}
          <span
            className={`px-2.5 py-1 rounded-full text-[11px] font-light border ${STATUS_CHROME[order.status]}`}
          >
            {order.status === "paid" && order.charges_ready && balance.balance > 0 ? "Balance due" : ORDER_STATUS_LABELS[order.status]}
          </span>
        </div>
      </header>

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

      <Panel
        title="1. Products"
        subtitle={
          locked
            ? undefined
            : hire
              ? "Type the code off the sticker. Each machine hires at 4% of its asking price a day."
              : "Type the code off the sticker, or search for it."
        }
      >
        <div className="space-y-3">
          {!locked && <ProductPicker orderId={order.id} onDone={handled} />}

          {lines.length === 0 ? (
            <p className="text-sm font-light text-muted py-6 text-center">
              Nothing on this order yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {lines.map((line, index) => {
                const cost = costByItem.get(line.item_id);
                const share = line.sold_price_cents ?? preview?.[index] ?? null;

                return (
                  <li
                    key={line.id}
                    className="bg-background border border-border rounded-xl p-3"
                  >
                    <div className="flex gap-3">
                      <ItemThumb
                        media={line.item?.media ?? []}
                        className="w-11 h-11 rounded-lg"
                        icon={14}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium tracking-tight truncate">
                              {line.item?.title ?? "Machine"}
                            </p>
                            <p className="text-[11px] font-light text-muted truncate">
                              <span className="font-mono tracking-widest">
                                {line.item?.sku}
                              </span>
                              {line.item?.brand ? ` · ${line.item.brand}` : ""}
                            </p>
                          </div>

                          <div className="shrink-0 flex items-center gap-2">
                            {line.item && <StatusPill status={line.item.status} size="sm" />}
                            {!locked && (
                              <button
                                type="button"
                                onClick={() => drop(line.item_id)}
                                disabled={busy}
                                aria-label="Take this machine off the order"
                                className="w-7 h-7 rounded-lg border border-border text-muted
                                           hover:text-status-sold hover:border-status-sold/40
                                           transition-colors flex items-center justify-center
                                           disabled:opacity-40"
                              >
                                <iconify-icon
                                  icon="solar:trash-bin-minimalistic-linear"
                                  width="13"
                                  height="13"
                                  noobserver=""
                                />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* The numbers a salesperson is holding in their head
                            while they talk. Asking, what it cost us split the
                            two ways that matter, and what the same machine
                            would cost new — which is the argument, not a cost. */}
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] tabular-nums">
                          <Figure label="Asking" value={rands(line.list_price_cents)} />
                          {hire && (
                            <Figure label="Per day" value={rands(hireDailyRateCents(line.list_price_cents))} />
                          )}
                          {hire && days ? (
                            <Figure
                              label={locked ? "Earned" : `Hire, ${days} day${days === 1 ? "" : "s"}`}
                              value={rands(line.sold_price_cents ?? hireFeeCents(line.list_price_cents, days))}
                              accent
                            />
                          ) : null}
                          {!hire && line.retail_price_cents ? (
                            <Figure label="New" value={rands(line.retail_price_cents)} />
                          ) : null}
                          {cost && (
                            <>
                              <Figure label="Auction" value={rands(cost.cost_purchase_cents)} />
                              <Figure label="Workshop" value={rands(cost.cost_refurb_cents)} />
                              <Figure label="Cost" value={rands(cost.cost_total_cents)} strong />
                            </>
                          )}
                          {!hire && share !== null && (
                            <Figure
                              label={locked ? "Sold for" : "Will record"}
                              value={rands(share)}
                              accent
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {lines.length > 0 && (
            <div className="border-t border-white/5 pt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] tabular-nums justify-end">
              <Figure label="Asking" value={rands(listTotal)} strong />
              {hire && days ? (
                <Figure label={`Hire, ${days} day${days === 1 ? "" : "s"}`} value={rands(hireTotal)} strong accent />
              ) : null}
              {!hire && retailTotal > 0 && <Figure label="New would cost" value={rands(retailTotal)} />}
              {costTotal !== null && <Figure label="Cost floor" value={rands(costTotal)} strong />}
            </div>
          )}
        </div>
      </Panel>

      <CustomerPicker order={order} locked={locked} onDone={handled} />

      <Panel title="3. Purchase option" subtitle="Choose the agreement. Choosing an option does not record a payment.">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {PURCHASE_OPTIONS.map(next => <button key={next} type="button" aria-pressed={option === next}
            disabled={locked || busy || !order.sale_plans_ready || !order.lead_id || lines.length === 0 || Boolean(order.sold_by)}
            onClick={() => void switchOption(next)}
            className={`rounded-xl border p-3 text-sm text-left transition-colors disabled:cursor-not-allowed ${option === next ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:border-white/30 disabled:opacity-50'}`}>
            {PURCHASE_OPTION_LABELS[next]}
          </button>)}
        </div>
        {!order.sale_plans_ready ? <p className="mt-3 text-xs text-muted">The new options need the database migration before use.</p> : !order.lead_id || !lines.length ? <p className="mt-3 text-xs text-muted">Add products and a customer to choose an option.</p> : null}
        {option === 'payjustnow' && <p className="mt-3 text-xs text-muted">Record the payment received from PayJustNow. Customer instalments are handled by the provider.</p>}
      </Panel>

      {!hire && option && option !== 'immediate' && option !== 'payjustnow' && <SalePlanPanel key={`${order.id}-${order.plan_confirmed_at ?? order.sale_plan}`} order={order} listTotal={listTotal} financeInitialPercent={financeInitialPercent} busy={busy || chargesDirty} onDone={handled} onDirty={setPlanDirty} />}

      {hire && (
        <HirePanel
          order={order}
          lines={lines}
          locked={locked}
          busy={busy}
          onDirty={setHireDirty}
          onDone={handled}
        />
      )}

      <DeliveryPanel order={order} locked={order.status !== "draft"} busy={busy} onDone={handled} />
      {option === "asset_finance" && <InstallationPanel key={`${order.id}-${order.installation_quote_cents}-${order.installation_accepted}`} order={order} busy={busy} onDirty={setChargesDirty} onDone={handled} />}

      {/* Above the payment, because it is written DURING the conversation —
          "collecting on Saturday", "hire back on the 17th" — and below it is
          where a salesperson stops looking once the money is taken. It prints
          on the invoice, which is what makes it worth typing. */}
      <NotesPanel order={order} locked={order.status !== "draft"} busy={busy} track={track} onDone={handled} />


      {(hire || option === "immediate" || option === "payjustnow") && <PaymentPanel
        key={`${order.id}-${option}-${listTotal}`}
        order={order}
        listTotalCents={listTotal}
        costTotalCents={costTotal}
        showCosts={showCosts}
        // Everybody, since 20260819110000 removed the ranks. Reopening still
        // rewrites revenue that has already been reported — it is stamped with
        // an actor and it explains itself on the customer's timeline, which is
        // what makes that safe to hand to whoever is standing at the counter.
        canReopen={canReopenSale(role)}
        hire={
          hire
            ? {
                days,
                totalCents: hireTotal,
                returned: Boolean(order.hire_returned_at),
                dirty: hireDirty,
              }
            : null
        }
        busy={busy || planDirty || chargesDirty}
        track={track}
        beforeConfirm={flush}
        onDone={handled}
      />}

      {(hire || option === "immediate" || option === "payjustnow") && order.charges_ready && (order.status !== "draft" || order.receipts.length > 0) &&
        <PaymentLedger order={order} totalCents={chargedTotal} busy={busy || chargesDirty} onDone={handled} />}

      {!locked && !order.sold_by && option !== 'immediate' && option !== 'payjustnow' && option !== 'hire' && <Button variant="danger" disabled={busy} onClick={() => void discard()}>Discard draft &amp; release items</Button>}

      {/* Last, because it is the last thing that happens: the money is
          recorded and then the customer is handed something. A proforma is the
          exception and goes out before any of it — which is why this panel is
          on the screen while the order is still open, rather than appearing
          once it is paid. */}
      <InvoicePanel
        order={order}
        invoices={invoices}
        // The order's own generated total, not one added up here. It is what
        // the panel compares an issued invoice against to notice that the sale
        // has been corrected since the customer was given one.
        chargedTotalCents={chargedTotal}
        configured={invoicing}
        busy={busy || chargesDirty || hireDirty || planDirty}
        onDone={handled}
      />

      {order.lead && (
        <p className="text-[11px] font-light text-muted text-center">
          <Link href={`/leads/${order.lead.id}`} className="hover:text-white transition-colors">
            See everything about this customer
          </Link>
        </p>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  strong,
  accent,
}: {
  label: string;
  value: string;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-muted font-light">{label}</span>
      <span
        className={`${strong ? "font-medium" : "font-light"} ${
          accent ? "text-accent" : "text-white/90"
        }`}
      >
        {value}
      </span>
    </span>
  );
}
