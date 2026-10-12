"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ORDER_STATUS_LABELS,
  SALE_PLAN_LABELS,
  purchaseOption,
  planBalance,
  PAYMENT_METHOD_LABELS,
  formatPhone,
  isOutOnHire,
  normalisePhone,
  randsExact as rands,
  type OrderStatus,
} from "@takemore/core";
import type { OrderRow } from "@/lib/orders";

/**
 * Every sale, filtered in the browser.
 *
 * Same call as LeadsBrowser and for the same reason: a few hundred sales a year
 * is less data than the JavaScript that would page it, and instant filtering is
 * the difference between a list somebody uses and a list somebody avoids.
 */

type Filter = "all" | "draft" | "paid" | "out" | "void" | "layby" | "reservation" | "asset_finance" | "due" | "overdue" | "refund" | "payjustnow";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "draft", label: "Open" },
  { value: "paid", label: "Paid" },
  // Rentals whose machines are still out. The one filter that is about where
  // the stock is rather than where the money is.
  { value: "out", label: "Out on hire" },
  { value: "void", label: "Cancelled" },
  { value: "layby", label: "Lay-by" },
  { value: "reservation", label: "Reserved" },
  { value: "asset_finance", label: "Rental Finance" },
  { value: "payjustnow", label: "PayJustNow" },
  { value: "due", label: "Payment due" },
  { value: "overdue", label: "Overdue" },
  { value: "refund", label: "Refund pending" },
];



// One formatter for the whole list — constructing one per row is the kind of
// hidden cost that makes a long list feel heavier than it is.
const orderDate = new Intl.DateTimeFormat("en-ZA", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const STATUS_CHROME: Record<OrderStatus, string> = {
  draft: "border-accent/40 text-accent",
  paid: "border-status-ready/40 text-status-ready",
  void: "border-border text-muted",
};

const customerOf = (order: OrderRow): string => {
  const lead = order.lead;
  if (!lead) return "No customer yet";
  return (
    lead.full_name?.trim() ||
    lead.business_name?.trim() ||
    (lead.phone ? formatPhone(lead.phone) : "") ||
    "Someone"
  );
};

export default function OrdersBrowser({ orders }: { orders: OrderRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    // "082 123 4567" and "+27 82 123 4567" have to find the same sale, so the
    // typed term is normalised the way the stored column is.
    const asPhone = normalisePhone(query);

    return orders.filter((order) => {
      const b = planBalance(order, order.charged_total_cents ?? 0, order.receipts);
      if (filter === "payjustnow" && purchaseOption(order) !== "payjustnow") return false;
      if (filter === "out" && !isOutOnHire(order)) return false;
      if (["draft", "paid", "void"].includes(filter) && order.status !== filter) return false;
      if (["layby", "reservation", "asset_finance"].includes(filter) && (order.sale_plan !== filter || order.status !== "draft")) return false;
      if (filter === "due" && (order.status === "void" || (b.due <= 0 && !(order.status === "paid" && order.charges_ready && b.balance > 0)))) return false;
      if (filter === "overdue" && (order.status === "void" || !order.plan_confirmed_at || !["layby","reservation"].includes(order.sale_plan ?? "") || b.overdue <= 0)) return false;
      if (filter === "refund" && (order.status === "void" ? b.received <= 0 : b.refundDue <= 0)) return false;
      if (!term) return true;

      const haystack = [
        order.code,
        order.lead?.full_name,
        order.lead?.business_name,
        order.lead?.phone,
        asPhone,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(term);
    });
  }, [orders, query, filter]);

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 mb-3 max-w-3xl">
        <div className="relative flex-1">
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
            placeholder="An order number, a name, or the last digits of their number"
            className="w-full bg-card border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm font-light
                       text-white/90 placeholder:text-muted/60 hover:border-white/20
                       focus:border-accent focus:outline-none transition-colors"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-light border transition-colors ${
              filter === f.value
                ? "border-accent/70 bg-accent/10 text-accent"
                : "border-border text-white/70 hover:border-white/25"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm font-light text-muted py-10 text-center">
          {orders.length === 0 ? "No orders yet." : "Nothing matches that."}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((order) => {
            const machines = order.lines.length;
            return (
              <li key={order.id}>
                <Link
                  href={`/orders/${order.id}`}
                  className="flex items-center gap-3 bg-card border border-border rounded-2xl p-3
                             hover:border-white/15 transition-colors"
                >
                  <span className="w-11 h-11 rounded-xl bg-background border border-border shrink-0
                                   flex items-center justify-center text-muted">
                    <iconify-icon icon="solar:cart-large-2-linear" width="18" height="18" noobserver="" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium tracking-tight truncate">
                      <span className="font-mono tracking-widest">{order.code}</span>
                      <span className="text-white/50"> · </span>
                      {customerOf(order)}
                    </p>
                    <p className="text-[11px] font-light text-muted truncate">
                      {[
                        `${machines} item${machines === 1 ? "" : "s"}`,
                        order.sale_plan ? SALE_PLAN_LABELS[order.sale_plan] : null,
                        order.kind === "hire" && order.hire_start && order.hire_end
                          ? `${orderDate.format(new Date(order.hire_start))} – ${orderDate.format(new Date(order.hire_end))}`
                          : null,
                        order.kind === "hire" && order.hire_returned_at ? "returned" : null,
                        order.delivery ? "delivered" : null,
                        order.payment_method
                          ? PAYMENT_METHOD_LABELS[order.payment_method]
                          : null,
                        orderDate.format(new Date(order.paid_at ?? order.created_at)),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>

                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    {(order.plan_confirmed_at || order.receipts.length > 0) && <PlanSummary order={order} />}
                    <span className="flex items-center gap-1.5">
                      {order.kind === "hire" && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-light border border-white/15 text-white/80">
                          {isOutOnHire(order) ? "Rental · out" : "Rental"}
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-light border ${STATUS_CHROME[order.status]}`}
                      >
                        {order.status === "paid" && order.charges_ready && planBalance(order, order.charged_total_cents ?? 0, order.receipts).balance > 0 ? "Balance due" : ORDER_STATUS_LABELS[order.status]}
                      </span>
                    </span>
                    {order.charged_total_cents !== null && order.status !== "draft" && (
                      <span className="text-xs font-light text-white/80 tabular-nums">
                        {rands(order.charged_total_cents)}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function PlanSummary({ order }: { order: OrderRow }) {
  const b = planBalance(order, order.charged_total_cents ?? 0, order.receipts);
  if (order.status === 'void') return b.received > 0 ? <span className="text-xs text-status-sold">Refund pending · {rands(b.received)}</span> : null;
  if (b.refundDue > 0) return <span className="text-xs text-status-sold">Refund due · {rands(b.refundDue)}</span>;
  const overdue = ["layby","reservation"].includes(order.sale_plan ?? "") && b.overdue > 0;
  return <span className="text-xs text-right"><span className={overdue ? "text-status-sold" : "text-accent"}>
    {overdue ? `Overdue · ${rands(b.overdue)}` : b.balance === 0 ? "Fully paid" : b.due > 0 ? `Payment due · ${rands(b.due)}` : `${rands(b.balance)} outstanding`}
    </span>{overdue ? <span className="block text-status-sold">Due {b.overdueDate}</span> : b.next && <span className="block text-muted">{b.next.label} · {b.next.date}</span>}</span>;
}
